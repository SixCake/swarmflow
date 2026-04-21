// Dashboard route — serves the embedded management UI with authentication
// All dashboard endpoints are under /dashboard* so auth can exclude them by prefix
// Login is required for all dashboard access; brute-force protection is built in

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import type { MissionManager } from '../../core/mission-manager.js'
import type { TaskBoard } from '../../core/task-board.js'
import type { TerminalRegistry, TerminalIdentity } from '../middleware/auth.js'
import type { DAGEngine } from '../../core/dag-engine.js'
import {
  DashboardAuth,
  getSessionToken,
  setSessionCookie,
  clearSessionCookie,
  getClientIp,
} from '../middleware/dashboard-auth.js'
import type { DashboardAuthConfig } from '../middleware/dashboard-auth.js'
import { randomUUID } from 'crypto'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

function loadHtmlFile(filename: string): string {
  const currentDir = dirname(fileURLToPath(import.meta.url))
  const htmlPath = resolve(currentDir, '..', filename)
  return readFileSync(htmlPath, 'utf-8')
}

export function registerDashboardRoutes(
  app: FastifyInstance,
  missionManager: MissionManager,
  taskBoard: TaskBoard,
  terminalRegistry: TerminalRegistry,
  dagEngine: DAGEngine,
  dashboardAuthConfig?: DashboardAuthConfig,
): void {
  let cachedDashboardHtml: string | null = null
  let cachedLoginHtml: string | null = null

  // If no auth config, dashboard is disabled
  if (!dashboardAuthConfig) {
    app.get('/dashboard', async (_request, reply) => {
      reply.code(503).send({ error: 'Dashboard authentication not configured' })
    })
    return
  }

  const dashboardAuth = new DashboardAuth(dashboardAuthConfig)
  const sessionTtl = dashboardAuthConfig.sessionTtlSeconds ?? 4 * 60 * 60

  // ─── Auth Helper ────────────────────────────────────────

  function requireAuth(request: FastifyRequest, reply: FastifyReply): boolean {
    const token = getSessionToken(request)
    if (!token || !dashboardAuth.validateSession(token)) {
      return false
    }
    return true
  }

  // ─── Login Routes (no auth required) ───────────────────

  app.get('/dashboard/login', async (_request, reply) => {
    if (!cachedLoginHtml) {
      cachedLoginHtml = loadHtmlFile('dashboard-login.html')
    }
    reply.type('text/html').send(cachedLoginHtml)
  })

  app.post<{ Body: { username: string; password: string } }>(
    '/dashboard/login',
    async (request, reply) => {
      const { username, password } = request.body ?? {}

      if (!username || !password) {
        reply.code(400).send({ success: false, error: 'Username and password required' })
        return
      }

      const ipAddress = getClientIp(request)
      const result = dashboardAuth.login(username, password, ipAddress)

      if (!result.success) {
        const statusCode = result.retryAfterSeconds ? 429 : 401
        reply.code(statusCode).send({
          success: false,
          error: result.error,
          retryAfterSeconds: result.retryAfterSeconds,
        })
        return
      }

      setSessionCookie(reply, result.token!, sessionTtl)
      reply.send({ success: true })
    },
  )

  app.post('/dashboard/logout', async (request, reply) => {
    const token = getSessionToken(request)
    if (token) {
      dashboardAuth.logout(token)
    }
    clearSessionCookie(reply)
    reply.send({ success: true })
  })

  // ─── Dashboard Page (auth required) ────────────────────

  app.get('/dashboard', async (request, reply) => {
    if (!requireAuth(request, reply)) {
      reply.redirect('/dashboard/login')
      return
    }
    if (!cachedDashboardHtml) {
      cachedDashboardHtml = loadHtmlFile('dashboard.html')
    }
    reply.type('text/html').send(cachedDashboardHtml)
  })

  // ─── Dashboard Data APIs (auth required) ───────────────

  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const urlPath = request.url.split('?')[0]

    if (!urlPath.startsWith('/dashboard/api/')) return

    if (!requireAuth(request, reply)) {
      reply.code(401).send({ error: 'Unauthorized' })
    }
  })

  app.get('/dashboard/api/missions', async (_request, reply) => {
    const missions = missionManager.listMissions()
    reply.send(missions)
  })

  app.get('/dashboard/api/tasks', async (_request, reply) => {
    const tasks = taskBoard.listAll()
    reply.send(tasks)
  })

  app.get('/dashboard/api/terminals', async (_request, reply) => {
    const terminals = terminalRegistry.listAll()
    reply.send(terminals.map((t: TerminalIdentity) => ({
      terminalId: t.terminalId,
      identityId: t.identityId,
      registeredAt: t.registeredAt.toISOString(),
      lastActiveAt: t.lastActiveAt.toISOString(),
      isActive: t.isActive,
      capabilities: t.capabilities,
      registeredFromIp: t.registeredFromIp,
    })))
  })

  // ─── Agent Management APIs ─────────────────────────────

  app.post<{ Body: { identityId: string; capabilities?: string[] } }>(
    '/dashboard/api/agents/register',
    async (request, reply) => {
      const { identityId, capabilities } = request.body ?? {}

      if (!identityId || typeof identityId !== 'string' || identityId.trim().length === 0) {
        reply.code(400).send({ error: 'Missing required field: identityId' })
        return
      }

      const terminalId = randomUUID()
      const apiKey = `sf-${randomUUID().replace(/-/g, '')}`
      const ipAddress = getClientIp(request)
      const cleanCapabilities = Array.isArray(capabilities)
        ? capabilities.map(c => String(c).trim()).filter(Boolean)
        : []

      const terminal = terminalRegistry.register(
        terminalId,
        identityId.trim(),
        apiKey,
        cleanCapabilities,
        ipAddress,
      )

      if (!terminal) {
        reply.code(429).send({ error: 'Terminal limit exceeded for this identity' })
        return
      }

      reply.code(201).send({
        terminalId: terminal.terminalId,
        identityId: terminal.identityId,
        apiKey: terminal.apiKey,
        capabilities: terminal.capabilities,
        registeredAt: terminal.registeredAt.toISOString(),
      })
    },
  )

  app.delete<{ Params: { id: string } }>(
    '/dashboard/api/agents/:id',
    async (request, reply) => {
      const { id } = request.params
      const success = terminalRegistry.deactivate(id)
      if (!success) {
        reply.code(404).send({ error: 'Agent not found' })
        return
      }
      reply.send({ success: true, terminalId: id })
    },
  )

  app.get('/dashboard/api/threads', async (_request, reply) => {
    const threads = dagEngine.getAllThreads()
    reply.send(threads.map(thread => ({
      id: thread.id,
      missionId: thread.missionId,
      postTaskId: thread.postTaskId,
      postAuthor: thread.postAuthor,
      participants: thread.participants,
      rounds: thread.rounds,
      status: thread.status,
    })))
  })
}
