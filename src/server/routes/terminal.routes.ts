// Terminal registration and management REST API routes

import type { FastifyInstance } from 'fastify'
import { TerminalRegistry } from '../middleware/auth.js'
import type { TerminalIdentity } from '../middleware/auth.js'
import { randomUUID } from 'crypto'

export function registerTerminalRoutes(
  app: FastifyInstance,
  registry: TerminalRegistry,
): void {
  // POST /api/terminals/register — Register a new terminal
  app.post<{
    Body: { identityId: string; capabilities?: string[] }
  }>('/api/terminals/register', async (request, reply) => {
    const { identityId, capabilities } = request.body
    if (!identityId) {
      reply.code(400).send({ error: 'Missing required field: identityId' })
      return
    }

    const terminalId = randomUUID()
    const apiKey = `sf-${randomUUID().replace(/-/g, '')}`

    const terminal = registry.register(terminalId, identityId, apiKey)
    if (!terminal) {
      reply.code(429).send({ error: 'Terminal limit exceeded for this identity' })
      return
    }

    reply.code(201).send({
      terminalId: terminal.terminalId,
      identityId: terminal.identityId,
      apiKey: terminal.apiKey,
      capabilities: capabilities ?? [],
      registeredAt: terminal.registeredAt.toISOString(),
    })
  })

  // GET /api/terminals/me — Get current terminal identity (via API Key)
  app.get('/api/terminals/me', async (request, reply) => {
    const terminal = extractTerminal(request, registry)
    if (!terminal) {
      reply.code(401).send({ error: 'Invalid or missing terminal API key' })
      return
    }

    reply.send({
      terminalId: terminal.terminalId,
      identityId: terminal.identityId,
      registeredAt: terminal.registeredAt.toISOString(),
      lastActiveAt: terminal.lastActiveAt.toISOString(),
      isActive: terminal.isActive,
    })
  })

  // POST /api/terminals/:id/rotate-key — Rotate API key for a terminal
  app.post<{
    Params: { id: string }
  }>('/api/terminals/:id/rotate-key', async (request, reply) => {
    const { id } = request.params
    const newApiKey = `sf-${randomUUID().replace(/-/g, '')}`

    const result = registry.rotateKey(id, newApiKey)
    if (!result) {
      reply.code(404).send({ error: 'Terminal not found' })
      return
    }

    reply.send({ terminalId: id, apiKey: result })
  })

  // DELETE /api/terminals/:id — Deactivate a terminal
  app.delete<{
    Params: { id: string }
  }>('/api/terminals/:id', async (request, reply) => {
    const success = registry.deactivate(request.params.id)
    if (!success) {
      reply.code(404).send({ error: 'Terminal not found' })
      return
    }
    reply.send({ success: true, terminalId: request.params.id })
  })

  // GET /api/terminals — List terminals for the current identity
  app.get<{
    Querystring: { identityId?: string }
  }>('/api/terminals', async (request, reply) => {
    const { identityId } = request.query
    if (!identityId) {
      reply.code(400).send({ error: 'Missing required query parameter: identityId' })
      return
    }

    const terminals = registry.getTerminalsByIdentity(identityId)
    reply.send(terminals.map(t => ({
      terminalId: t.terminalId,
      identityId: t.identityId,
      registeredAt: t.registeredAt.toISOString(),
      lastActiveAt: t.lastActiveAt.toISOString(),
      isActive: t.isActive,
    })))
  })
}

/**
 * Extract terminal identity from the Authorization header using TerminalRegistry.
 */
function extractTerminal(
  request: { headers: { authorization?: string } },
  registry: TerminalRegistry,
): TerminalIdentity | null {
  const authHeader = request.headers.authorization
  if (!authHeader) return null

  const [scheme, token] = authHeader.split(' ')
  if (scheme !== 'Bearer' || !token) return null

  return registry.authenticate(token)
}
