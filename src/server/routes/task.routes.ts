// Task REST API routes

import type { FastifyInstance } from 'fastify'
import type { TaskBoard } from '../../core/task-board.js'
import type { Task } from '../../types/task.types.js'
import type { TaskResult } from '../../types/result.types.js'

export function registerTaskRoutes(
  app: FastifyInstance,
  taskBoard: TaskBoard
): void {
  // POST /api/tasks — Publish a new task
  app.post<{ Body: Task }>('/api/tasks', async (request, reply) => {
    const task = request.body
    if (!task || !task.id || !task.missionId) {
      reply.code(400).send({ error: 'Missing required fields: id, missionId' })
      return
    }
    try {
      taskBoard.publish(task)
      reply.code(201).send({ success: true, taskId: task.id })
    } catch (error) {
      reply.code(500).send({ error: 'Failed to publish task' })
    }
  })

  // GET /api/tasks/available — Get available tasks for claiming
  app.get<{
    Querystring: { capabilities?: string }
  }>('/api/tasks/available', async (request, reply) => {
    const capabilitiesParam = request.query.capabilities
    const capabilities = capabilitiesParam
      ? capabilitiesParam.split(',').map(c => c.trim())
      : undefined
    const tasks = taskBoard.getAvailableTasks(capabilities)
    reply.send(tasks)
  })

  // POST /api/tasks/:id/claim — Claim a task
  app.post<{
    Params: { id: string }
    Body: { workerId: string }
  }>('/api/tasks/:id/claim', async (request, reply) => {
    const { id } = request.params
    const { workerId } = request.body

    if (!workerId) {
      reply.code(400).send({ error: 'Missing required field: workerId' })
      return
    }

    const success = taskBoard.claim(id, workerId)
    if (!success) {
      reply.code(409).send({ error: 'Task not available for claiming' })
      return
    }

    reply.send({ success: true, taskId: id, claimedBy: workerId })
  })

  // POST /api/tasks/:id/submit — Submit task result
  app.post<{
    Params: { id: string }
    Body: { result: TaskResult }
  }>('/api/tasks/:id/submit', async (request, reply) => {
    const { id } = request.params
    const { result } = request.body

    if (!result || !result.output || !result.metadata) {
      reply.code(400).send({ error: 'Missing required field: result with output and metadata' })
      return
    }

    const success = taskBoard.submit(id, result)
    if (!success) {
      reply.code(409).send({ error: 'Task not in claimed state' })
      return
    }

    reply.send({ success: true, taskId: id })
  })

  // POST /api/tasks/:id/verify — Verify a submitted task
  app.post<{ Params: { id: string } }>('/api/tasks/:id/verify', async (request, reply) => {
    const { id } = request.params
    const success = taskBoard.verify(id)
    if (!success) {
      reply.code(409).send({ error: 'Task not in submitted state' })
      return
    }
    reply.send({ success: true, taskId: id })
  })

  // GET /api/tasks/:id — Get task by ID
  app.get<{ Params: { id: string } }>('/api/tasks/:id', async (request, reply) => {
    const task = taskBoard.getTask(request.params.id)
    if (!task) {
      reply.code(404).send({ error: 'Task not found' })
      return
    }
    reply.send(task)
  })
}
