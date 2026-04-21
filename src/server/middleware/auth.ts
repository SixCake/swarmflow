// Bearer Token authentication middleware for Fastify

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'

export interface AuthConfig {
  token: string
  excludePaths?: string[]
}

export function registerAuth(app: FastifyInstance, config: AuthConfig): void {
  const excludePaths = new Set(config.excludePaths ?? ['/health'])

  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    // Skip auth for excluded paths
    if (excludePaths.has(request.url)) {
      return
    }

    const authHeader = request.headers.authorization
    if (!authHeader) {
      reply.code(401).send({ error: 'Missing Authorization header' })
      return
    }

    const [scheme, token] = authHeader.split(' ')
    if (scheme !== 'Bearer' || token !== config.token) {
      reply.code(401).send({ error: 'Invalid token' })
      return
    }
  })
}
