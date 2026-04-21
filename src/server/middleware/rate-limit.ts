// Rate limiting middleware for Fastify
// Per-endpoint rate limiting

import type { FastifyRequest, FastifyReply } from 'fastify'

const requestCounts = new Map<string, { count: number; resetTime: number }>()
const MAX_REQUESTS = 100
const WINDOW_MS = 60_000 // 1 minute

export async function rateLimitMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const ip = request.ip || 'unknown'
  const now = Date.now()
  const record = requestCounts.get(ip)

  if (!record || now > record.resetTime) {
    requestCounts.set(ip, { count: 1, resetTime: now + WINDOW_MS })
    return
  }

  if (record.count >= MAX_REQUESTS) {
    reply.code(429).send({ error: 'Too many requests' })
    return
  }

  record.count++
}
