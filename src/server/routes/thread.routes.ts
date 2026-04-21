// Thread query REST API routes — InteractionThread listing, details, and rounds

import type { FastifyInstance } from 'fastify'
import type { DAGEngine } from '../../core/dag-engine.js'

export function registerThreadRoutes(
  app: FastifyInstance,
  dagEngine: DAGEngine,
): void {
  // GET /api/missions/:missionId/threads — List all threads for a mission
  app.get<{
    Params: { missionId: string }
  }>('/api/missions/:missionId/threads', async (request, reply) => {
    const { missionId } = request.params
    const mission = dagEngine.getMission()

    // Verify mission matches
    if (!mission || mission.id !== missionId) {
      reply.code(404).send({ error: 'Mission not found or not active' })
      return
    }

    const threads = dagEngine.getAllThreads()
    reply.send(threads.map(t => ({
      id: t.id,
      missionId: t.missionId,
      postAuthor: t.postAuthor,
      participants: t.participants,
      roundCount: t.rounds.length,
      status: t.status,
    })))
  })

  // GET /api/threads/:id — Get thread details
  app.get<{
    Params: { id: string }
  }>('/api/threads/:id', async (request, reply) => {
    const thread = dagEngine.getThread(request.params.id)
    if (!thread) {
      reply.code(404).send({ error: 'Thread not found' })
      return
    }

    reply.send({
      id: thread.id,
      missionId: thread.missionId,
      postTaskId: thread.postTaskId,
      postAuthor: thread.postAuthor,
      participants: thread.participants,
      rounds: thread.rounds.map(r => ({
        roundNumber: r.roundNumber,
        taskCount: r.tasks.length,
        resultCount: r.results.length,
      })),
      status: thread.status,
    })
  })

  // GET /api/threads/:id/rounds — Get all rounds for a thread
  app.get<{
    Params: { id: string }
  }>('/api/threads/:id/rounds', async (request, reply) => {
    const thread = dagEngine.getThread(request.params.id)
    if (!thread) {
      reply.code(404).send({ error: 'Thread not found' })
      return
    }

    reply.send(thread.rounds.map(r => ({
      roundNumber: r.roundNumber,
      tasks: r.tasks.map(t => ({
        id: t.id,
        blueprint: t.blueprint,
        status: t.status,
      })),
      results: r.results.map(res => ({
        output: res.output,
        metadata: res.metadata,
      })),
    })))
  })
}
