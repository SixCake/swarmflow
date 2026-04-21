// Mission API routes for Fastify
// POST/GET /missions, /missions/:id/progress, /missions/:id/cancel

import type { FastifyInstance } from 'fastify'

export async function missionRoutes(app: FastifyInstance): Promise<void> {
  app.post('/missions', async (request, reply) => {
    reply.send({ message: 'Create mission endpoint' })
  })

  app.get('/missions/:id', async (request, reply) => {
    reply.send({ message: 'Get mission endpoint' })
  })

  app.get('/missions/:id/progress', async (request, reply) => {
    reply.send({ message: 'Get mission progress endpoint' })
  })

  app.post('/missions/:id/cancel', async (request, reply) => {
    reply.send({ message: 'Cancel mission endpoint' })
  })
}
