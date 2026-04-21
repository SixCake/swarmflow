// Fastify application setup
// HTTP server for TaskBoard and Mission APIs

import Fastify from 'fastify'
import type { FastifyInstance } from 'fastify'

export function createApp(): FastifyInstance {
  const app = Fastify({ logger: true })

  // Health check
  app.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() }
  })

  return app
}

export type { FastifyInstance }
