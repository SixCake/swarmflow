// Bearer Token authentication middleware for Fastify
// Supports terminal registration, API key rotation, and per-terminal limits

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'

// ─── Types ──────────────────────────────────────────────────

export interface AuthConfig {
  token: string
  excludePaths?: string[]
  /** Maximum number of terminals per identity (default: 10) */
  maxTerminalsPerIdentity?: number
  /** API key rotation interval in ms (default: 24h). 0 = no rotation */
  keyRotationIntervalMs?: number
}

export interface TerminalIdentity {
  terminalId: string
  identityId: string
  apiKey: string
  registeredAt: Date
  lastActiveAt: Date
  isActive: boolean
}

// ─── Terminal Registry ──────────────────────────────────────

export class TerminalRegistry {
  private terminals: Map<string, TerminalIdentity> = new Map()
  private identityTerminals: Map<string, Set<string>> = new Map()
  private apiKeys: Map<string, string> = new Map() // apiKey → terminalId
  private maxTerminalsPerIdentity: number

  constructor(maxTerminalsPerIdentity = 10) {
    this.maxTerminalsPerIdentity = maxTerminalsPerIdentity
  }

  /**
   * Register a new terminal for an identity.
   * Returns the terminal identity or null if limit exceeded.
   */
  register(terminalId: string, identityId: string, apiKey: string): TerminalIdentity | null {
    // Check per-identity limit
    const existing = this.identityTerminals.get(identityId) ?? new Set()
    if (existing.size >= this.maxTerminalsPerIdentity && !existing.has(terminalId)) {
      return null
    }

    const terminal: TerminalIdentity = {
      terminalId,
      identityId,
      apiKey,
      registeredAt: new Date(),
      lastActiveAt: new Date(),
      isActive: true,
    }

    this.terminals.set(terminalId, terminal)
    existing.add(terminalId)
    this.identityTerminals.set(identityId, existing)
    this.apiKeys.set(apiKey, terminalId)

    return terminal
  }

  /**
   * Authenticate a request by API key.
   * Returns the terminal identity or null if invalid.
   */
  authenticate(apiKey: string): TerminalIdentity | null {
    const terminalId = this.apiKeys.get(apiKey)
    if (!terminalId) return null

    const terminal = this.terminals.get(terminalId)
    if (!terminal || !terminal.isActive) return null

    terminal.lastActiveAt = new Date()
    return terminal
  }

  /**
   * Rotate the API key for a terminal.
   * Returns the new API key or null if terminal not found.
   */
  rotateKey(terminalId: string, newApiKey: string): string | null {
    const terminal = this.terminals.get(terminalId)
    if (!terminal) return null

    // Remove old key mapping
    this.apiKeys.delete(terminal.apiKey)

    // Set new key
    terminal.apiKey = newApiKey
    this.apiKeys.set(newApiKey, terminalId)

    return newApiKey
  }

  /**
   * Deactivate a terminal.
   */
  deactivate(terminalId: string): boolean {
    const terminal = this.terminals.get(terminalId)
    if (!terminal) return false

    terminal.isActive = false
    this.apiKeys.delete(terminal.apiKey)
    return true
  }

  /**
   * Get all terminals for an identity.
   */
  getTerminalsByIdentity(identityId: string): TerminalIdentity[] {
    const terminalIds = this.identityTerminals.get(identityId) ?? new Set()
    return [...terminalIds]
      .map(id => this.terminals.get(id))
      .filter((t): t is TerminalIdentity => t !== undefined)
  }

  /**
   * Get terminal by ID.
   */
  getTerminal(terminalId: string): TerminalIdentity | undefined {
    return this.terminals.get(terminalId)
  }

  /**
   * Get all registered terminals.
   */
  listAll(): TerminalIdentity[] {
    return [...this.terminals.values()]
  }

  /**
   * Get total registered terminal count.
   */
  getTerminalCount(): number {
    return this.terminals.size
  }
}

// ─── Middleware ──────────────────────────────────────────────

/**
 * Dual-mode auth middleware.
 * Mode 1: Global Bearer token (existing) — matches config.token
 * Mode 2: Terminal API Key — validated via TerminalRegistry
 * If either mode succeeds the request proceeds. Terminal auth decorates
 * request with `terminalIdentity`.
 */
export function registerAuth(
  app: FastifyInstance,
  config: AuthConfig,
  terminalRegistry?: TerminalRegistry
): void {
  const excludePaths = config.excludePaths ?? ['/health']

  // Decorate request so downstream routes can access terminal identity
  app.decorateRequest('terminalIdentity', null)

  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    // Skip auth for excluded paths (supports both exact match and prefix match)
    const urlPath = request.url.split('?')[0]
    const isExcluded = excludePaths.some(pattern =>
      urlPath === pattern || urlPath.startsWith(pattern + '/')
    )
    if (isExcluded) {
      return
    }

    const authHeader = request.headers.authorization
    if (!authHeader) {
      reply.code(401).send({ error: 'Missing Authorization header' })
      return
    }

    const [scheme, token] = authHeader.split(' ')
    if (scheme !== 'Bearer' || !token) {
      reply.code(401).send({ error: 'Invalid Authorization format' })
      return
    }

    // Mode 1: Global token
    if (token === config.token) {
      return
    }

    // Mode 2: Terminal API Key via TerminalRegistry
    if (terminalRegistry) {
      const terminal = terminalRegistry.authenticate(token)
      if (terminal) {
        ;(request as any).terminalIdentity = terminal
        return
      }
    }

    reply.code(401).send({ error: 'Invalid token' })
  })
}
