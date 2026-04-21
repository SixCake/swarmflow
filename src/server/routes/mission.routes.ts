// Mission REST API routes

import type { FastifyInstance } from 'fastify'
import type { MissionManager } from '../../core/mission-manager.js'
import type { Mission, MissionStatus } from '../../types/mission.types.js'

export function registerMissionRoutes(
  app: FastifyInstance,
  missionManager: MissionManager
): void {
  // POST /api/missions — Create a new mission
  app.post<{ Body: Mission }>('/api/missions', async (request, reply) => {
    try {
      const mission = request.body
      if (!mission.id || !mission.goal) {
        reply.code(400).send({ error: 'Missing required fields: id, goal' })
        return
      }
      const record = missionManager.createMission(mission)
      reply.code(201).send(record)
    } catch (error) {
      reply.code(500).send({ error: 'Failed to create mission' })
    }
  })

  // GET /api/missions — List all missions
  app.get('/api/missions', async (_request, reply) => {
    const missions = missionManager.listMissions()
    reply.send(missions)
  })

  // GET /api/missions/:id — Get mission by ID
  app.get<{ Params: { id: string } }>('/api/missions/:id', async (request, reply) => {
    const record = missionManager.getMission(request.params.id)
    if (!record) {
      reply.code(404).send({ error: 'Mission not found' })
      return
    }
    reply.send(record)
  })

  // PATCH /api/missions/:id/status — Update mission status
  app.patch<{
    Params: { id: string }
    Body: { status: string }
  }>('/api/missions/:id/status', async (request, reply) => {
    const { id } = request.params
    const { status } = request.body

    const record = missionManager.getMission(id)
    if (!record) {
      reply.code(404).send({ error: 'Mission not found' })
      return
    }

    const validStatuses: MissionStatus[] = ['created', 'running', 'completed', 'failed', 'cancelled']
    if (!validStatuses.includes(status as MissionStatus)) {
      reply.code(400).send({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` })
      return
    }

    try {
      missionManager.updateStatus(id, status as MissionStatus)
      reply.send({ success: true, status })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update status'
      reply.code(400).send({ error: message })
    }
  })
}
