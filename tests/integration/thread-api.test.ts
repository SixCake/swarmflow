// Thread query + Heartbeat + Reject API integration tests

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createApp } from '../../src/server/app.js'
import { MissionManager } from '../../src/core/mission-manager.js'
import { TaskBoard } from '../../src/core/task-board.js'
import { DAGEngine } from '../../src/core/dag-engine.js'
import type { FastifyInstance } from 'fastify'
import type { Task } from '../../src/types/task.types.js'
import type { Mission } from '../../src/types/mission.types.js'

function createTestMission(): Mission {
  return {
    id: 'thread-test-mission',
    goal: 'Test thread queries',
    context: { topic: 'testing' },
    blueprints: [
      { role: 'analyst', instructions: 'Analyze', capabilities: ['analysis'] },
      { role: 'reviewer', instructions: 'Review', capabilities: ['review'] },
    ],
    phases: [
      {
        id: 'phase-0',
        type: 'parallel',
        taskTemplate: {
          type: 'analysis',
          instructionTemplate: 'Analyze the topic',
          expectedOutputSchema: {},
        },
        transitionRule: { type: 'all_completed' },
      },
    ],
    convergencePolicy: 'fixedRounds',
    config: {
      maxConcurrentTasks: 10,
      taskTimeoutMinutes: 30,
      maxRetries: 3,
      claimExpiryMinutes: 5,
    },
  }
}

function createTestTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'heartbeat-test-task',
    missionId: 'thread-test-mission',
    phaseId: 'phase-0',
    type: 'analysis',
    blueprint: { role: 'analyst', instructions: 'Analyze', capabilities: ['analysis'] },
    instructions: 'Analyze the topic',
    context: {},
    expectedOutputSchema: {},
    status: 'published',
    retryCount: 0,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 3600000),
    ...overrides,
  }
}

describe('Thread + Heartbeat + Reject API Integration Tests', () => {
  let app: FastifyInstance
  let taskBoard: TaskBoard
  let dagEngine: DAGEngine

  beforeEach(async () => {
    taskBoard = new TaskBoard()
    dagEngine = new DAGEngine()
    app = await createApp(
      { logger: false },
      {
        missionManager: new MissionManager(),
        taskBoard,
        dagEngine,
      },
    )
  })

  afterEach(async () => {
    await app.close()
  })

  // --- Thread Query API ---

  describe('GET /api/missions/:missionId/threads', () => {
    it('should return 404 when no mission is active', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/missions/non-existent/threads',
      })
      expect(res.statusCode).toBe(404)
    })

    it('should return threads for an active mission', async () => {
      const mission = createTestMission()
      await dagEngine.initialize(mission)

      const res = await app.inject({
        method: 'GET',
        url: `/api/missions/${mission.id}/threads`,
      })
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(Array.isArray(body)).toBe(true)
    })
  })

  describe('GET /api/threads/:id', () => {
    it('should return 404 for non-existent thread', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/threads/non-existent',
      })
      expect(res.statusCode).toBe(404)
    })
  })

  describe('GET /api/threads/:id/rounds', () => {
    it('should return 404 for non-existent thread', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/threads/non-existent/rounds',
      })
      expect(res.statusCode).toBe(404)
    })
  })

  // --- Heartbeat API ---

  describe('POST /api/tasks/:id/heartbeat', () => {
    it('should accept heartbeat for a claimed task', async () => {
      taskBoard.publish(createTestTask())
      taskBoard.claim('heartbeat-test-task', 'worker-1')

      const res = await app.inject({
        method: 'POST',
        url: '/api/tasks/heartbeat-test-task/heartbeat',
        payload: { workerId: 'worker-1', progress: 0.5, message: 'Processing...' },
      })
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.success).toBe(true)
      expect(body.taskId).toBe('heartbeat-test-task')
      expect(body.heartbeatAt).toBeDefined()
      expect(body.progress).toBe(0.5)
      expect(body.message).toBe('Processing...')
    })

    it('should reject heartbeat without workerId', async () => {
      taskBoard.publish(createTestTask())
      taskBoard.claim('heartbeat-test-task', 'worker-1')

      const res = await app.inject({
        method: 'POST',
        url: '/api/tasks/heartbeat-test-task/heartbeat',
        payload: {},
      })
      expect(res.statusCode).toBe(400)
    })

    it('should return 404 for non-existent task', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/tasks/non-existent/heartbeat',
        payload: { workerId: 'worker-1' },
      })
      expect(res.statusCode).toBe(404)
    })

    it('should return 409 if task not claimed by this worker', async () => {
      taskBoard.publish(createTestTask())
      taskBoard.claim('heartbeat-test-task', 'worker-1')

      const res = await app.inject({
        method: 'POST',
        url: '/api/tasks/heartbeat-test-task/heartbeat',
        payload: { workerId: 'worker-2' },
      })
      expect(res.statusCode).toBe(409)
    })

    it('should return 409 for unclaimed task', async () => {
      taskBoard.publish(createTestTask())

      const res = await app.inject({
        method: 'POST',
        url: '/api/tasks/heartbeat-test-task/heartbeat',
        payload: { workerId: 'worker-1' },
      })
      expect(res.statusCode).toBe(409)
    })
  })

  // --- Reject API ---

  describe('POST /api/tasks/:id/reject', () => {
    it('should reject/release a claimed task', async () => {
      taskBoard.publish(createTestTask())
      taskBoard.claim('heartbeat-test-task', 'worker-1')

      const res = await app.inject({
        method: 'POST',
        url: '/api/tasks/heartbeat-test-task/reject',
        payload: { workerId: 'worker-1', reason: 'Cannot process this type' },
      })
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.success).toBe(true)
      expect(body.releasedBy).toBe('worker-1')
      expect(body.reason).toBe('Cannot process this type')

      // Task should be back to published state
      const task = taskBoard.getTask('heartbeat-test-task')
      expect(task!.status).toBe('published')
    })

    it('should reject without workerId', async () => {
      taskBoard.publish(createTestTask())
      taskBoard.claim('heartbeat-test-task', 'worker-1')

      const res = await app.inject({
        method: 'POST',
        url: '/api/tasks/heartbeat-test-task/reject',
        payload: {},
      })
      expect(res.statusCode).toBe(400)
    })

    it('should return 404 for non-existent task', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/tasks/non-existent/reject',
        payload: { workerId: 'worker-1' },
      })
      expect(res.statusCode).toBe(404)
    })

    it('should return 409 if task not claimed by this worker', async () => {
      taskBoard.publish(createTestTask())
      taskBoard.claim('heartbeat-test-task', 'worker-1')

      const res = await app.inject({
        method: 'POST',
        url: '/api/tasks/heartbeat-test-task/reject',
        payload: { workerId: 'worker-2' },
      })
      expect(res.statusCode).toBe(409)
    })

    it('should return 409 for unclaimed task', async () => {
      taskBoard.publish(createTestTask())

      const res = await app.inject({
        method: 'POST',
        url: '/api/tasks/heartbeat-test-task/reject',
        payload: { workerId: 'worker-1' },
      })
      expect(res.statusCode).toBe(409)
    })

    it('should allow re-claiming after reject', async () => {
      taskBoard.publish(createTestTask())
      taskBoard.claim('heartbeat-test-task', 'worker-1')

      // Reject
      await app.inject({
        method: 'POST',
        url: '/api/tasks/heartbeat-test-task/reject',
        payload: { workerId: 'worker-1' },
      })

      // Another worker should be able to claim
      const claimRes = await app.inject({
        method: 'POST',
        url: '/api/tasks/heartbeat-test-task/claim',
        payload: { workerId: 'worker-2' },
      })
      expect(claimRes.statusCode).toBe(200)
      expect(JSON.parse(claimRes.body).claimedBy).toBe('worker-2')
    })
  })
})
