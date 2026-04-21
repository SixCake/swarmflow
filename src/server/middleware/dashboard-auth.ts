// Dashboard authentication middleware
// Provides username/password login with session cookies and brute-force protection
// Uses Node.js built-in crypto — no external dependencies

import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'

// ─── Types ──────────────────────────────────────────────────

export interface DashboardAuthConfig {
  /** Dashboard admin username */
  username: string
  /** Dashboard admin password (plaintext — will be hashed on first use) */
  password: string
  /** Session TTL in seconds (default: 4 hours) */
  sessionTtlSeconds?: number
  /** Max login attempts per IP within the window (default: 5) */
  maxLoginAttempts?: number
  /** Rate limit window in seconds (default: 60) */
  rateLimitWindowSeconds?: number
  /** IP lockout duration in seconds after exceeding max attempts (default: 300 = 5 min) */
  lockoutDurationSeconds?: number
}

interface Session {
  token: string
  createdAt: number
  expiresAt: number
}

interface LoginAttemptRecord {
  attempts: number
  windowStart: number
  lockedUntil: number
}

// ─── Password Hashing ───────────────────────────────────────

const SALT_LENGTH = 32
const KEY_LENGTH = 64
const SCRYPT_COST = 16384

function hashPassword(password: string): string {
  const salt = randomBytes(SALT_LENGTH).toString('hex')
  const derivedKey = scryptSync(password, salt, KEY_LENGTH, { N: SCRYPT_COST })
  return `${salt}:${derivedKey.toString('hex')}`
}

function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, hash] = storedHash.split(':')
  if (!salt || !hash) return false
  const derivedKey = scryptSync(password, salt, KEY_LENGTH, { N: SCRYPT_COST })
  const storedBuffer = Buffer.from(hash, 'hex')
  return timingSafeEqual(derivedKey, storedBuffer)
}

// ─── Session Store ──────────────────────────────────────────

class SessionStore {
  private sessions: Map<string, Session> = new Map()

  create(ttlSeconds: number): string {
    const token = randomBytes(32).toString('hex')
    const now = Date.now()
    this.sessions.set(token, {
      token,
      createdAt: now,
      expiresAt: now + ttlSeconds * 1000,
    })
    return token
  }

  validate(token: string): boolean {
    const session = this.sessions.get(token)
    if (!session) return false
    if (Date.now() > session.expiresAt) {
      this.sessions.delete(token)
      return false
    }
    return true
  }

  destroy(token: string): void {
    this.sessions.delete(token)
  }

  cleanup(): void {
    const now = Date.now()
    for (const [token, session] of this.sessions) {
      if (now > session.expiresAt) {
        this.sessions.delete(token)
      }
    }
  }
}

// ─── Brute-Force Protection ─────────────────────────────────

class LoginRateLimiter {
  private attempts: Map<string, LoginAttemptRecord> = new Map()
  private maxAttempts: number
  private windowMs: number
  private lockoutMs: number

  constructor(maxAttempts: number, windowSeconds: number, lockoutSeconds: number) {
    this.maxAttempts = maxAttempts
    this.windowMs = windowSeconds * 1000
    this.lockoutMs = lockoutSeconds * 1000
  }

  /**
   * Check if an IP is allowed to attempt login.
   * Returns { allowed, retryAfterSeconds } — retryAfterSeconds is 0 if allowed.
   */
  check(ipAddress: string): { allowed: boolean; retryAfterSeconds: number } {
    const now = Date.now()
    const record = this.attempts.get(ipAddress)

    if (!record) return { allowed: true, retryAfterSeconds: 0 }

    if (record.lockedUntil > now) {
      const retryAfterSeconds = Math.ceil((record.lockedUntil - now) / 1000)
      return { allowed: false, retryAfterSeconds }
    }

    if (now - record.windowStart > this.windowMs) {
      this.attempts.delete(ipAddress)
      return { allowed: true, retryAfterSeconds: 0 }
    }

    if (record.attempts >= this.maxAttempts) {
      record.lockedUntil = now + this.lockoutMs
      const retryAfterSeconds = Math.ceil(this.lockoutMs / 1000)
      return { allowed: false, retryAfterSeconds }
    }

    return { allowed: true, retryAfterSeconds: 0 }
  }

  recordFailure(ipAddress: string): void {
    const now = Date.now()
    const record = this.attempts.get(ipAddress)

    if (!record || now - record.windowStart > this.windowMs) {
      this.attempts.set(ipAddress, {
        attempts: 1,
        windowStart: now,
        lockedUntil: 0,
      })
      return
    }

    record.attempts++

    if (record.attempts >= this.maxAttempts) {
      record.lockedUntil = now + this.lockoutMs
    }
  }

  recordSuccess(ipAddress: string): void {
    this.attempts.delete(ipAddress)
  }

  cleanup(): void {
    const now = Date.now()
    for (const [ip, record] of this.attempts) {
      if (now - record.windowStart > this.windowMs && record.lockedUntil < now) {
        this.attempts.delete(ip)
      }
    }
  }
}

// ─── Dashboard Auth Manager ─────────────────────────────────

export class DashboardAuth {
  private username: string
  private passwordHash: string
  private sessionStore: SessionStore
  private rateLimiter: LoginRateLimiter
  private sessionTtlSeconds: number
  private cleanupInterval: ReturnType<typeof setInterval>

  constructor(config: DashboardAuthConfig) {
    this.username = config.username
    this.passwordHash = hashPassword(config.password)
    this.sessionTtlSeconds = config.sessionTtlSeconds ?? 4 * 60 * 60
    this.sessionStore = new SessionStore()
    this.rateLimiter = new LoginRateLimiter(
      config.maxLoginAttempts ?? 5,
      config.rateLimitWindowSeconds ?? 60,
      config.lockoutDurationSeconds ?? 300,
    )

    this.cleanupInterval = setInterval(() => {
      this.sessionStore.cleanup()
      this.rateLimiter.cleanup()
    }, 60_000)
  }

  /**
   * Attempt login. Returns session token on success, null on failure.
   */
  login(
    username: string,
    password: string,
    ipAddress: string,
  ): { success: boolean; token?: string; retryAfterSeconds?: number; error?: string } {
    const rateCheck = this.rateLimiter.check(ipAddress)
    if (!rateCheck.allowed) {
      return {
        success: false,
        retryAfterSeconds: rateCheck.retryAfterSeconds,
        error: `Too many login attempts. Try again in ${rateCheck.retryAfterSeconds}s.`,
      }
    }

    if (username !== this.username || !verifyPassword(password, this.passwordHash)) {
      this.rateLimiter.recordFailure(ipAddress)
      return { success: false, error: 'Invalid username or password' }
    }

    this.rateLimiter.recordSuccess(ipAddress)
    const token = this.sessionStore.create(this.sessionTtlSeconds)
    return { success: true, token }
  }

  validateSession(token: string): boolean {
    return this.sessionStore.validate(token)
  }

  logout(token: string): void {
    this.sessionStore.destroy(token)
  }

  destroy(): void {
    clearInterval(this.cleanupInterval)
  }
}

// ─── Fastify Hook ───────────────────────────────────────────

const SESSION_COOKIE_NAME = 'swarmflow_dash_session'

export function getSessionToken(request: FastifyRequest): string | null {
  const cookieHeader = request.headers.cookie
  if (!cookieHeader) return null

  const cookies = cookieHeader.split(';').reduce<Record<string, string>>((acc, pair) => {
    const [key, ...valueParts] = pair.trim().split('=')
    if (key) acc[key.trim()] = valueParts.join('=').trim()
    return acc
  }, {})

  return cookies[SESSION_COOKIE_NAME] || null
}

export function setSessionCookie(reply: FastifyReply, token: string, maxAgeSeconds: number): void {
  reply.header(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=${token}; Path=/dashboard; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}`,
  )
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.header(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=; Path=/dashboard; HttpOnly; SameSite=Strict; Max-Age=0`,
  )
}

export function getClientIp(request: FastifyRequest): string {
  const forwarded = request.headers['x-forwarded-for']
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim()
  }
  return request.ip
}

export { SESSION_COOKIE_NAME }
