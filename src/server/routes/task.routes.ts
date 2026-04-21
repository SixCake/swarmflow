// Task API routes for Fastify
// GET /tasks/available, POST /tasks/:id/claim|submit|heartbeat|abandon

import type { FastifyInstance } from 'fastify'

export async function taskRoutes(app: FastifyInstance): Promise<void> {
  app.get('/tasks/available', async (request, reply) => {
    reply.send({ message: 'Get available tasks endpoint' })
  })

  app.post('/tasks/:id/claim', async (request, reply) => {
    reply.send({ message: 'Claim task endpoint' })
  })

  app.post('/tasks/:id/submit', async (request, reply) => {
    reply.send({ message: 'Submit task result endpoint' })
  })

  app.post('/tasks/:id/heartbeat', async (request, reply) => {
    reply.send({ message: 'Task heartbeat endpoint' })
  })

  app.post('/tasks/:id/abandon', async (request, reply) => {
    reply.send({ message: 'Abandon task endpoint' })
  })
}
