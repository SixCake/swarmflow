// Bearer token authentication for Fastify
// Validates Authorization header

import type { FastifyRequest, FastifyReply } from 'fastify'

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const token = request.headers.authorization

  if (!token || !token.startsWith('Bearer ')) {
    reply.code(401).send({ error: 'Unauthorized: Missing or invalid token' })
    return
  }

  const bearerToken = token.slice(7)
  if (!bearerToken || bearerToken.length === 0) {
    reply.code(401).send({ error: 'Unauthorized: Empty token' })
    return
  }
}
