// HTTP API integration tests
// Tests Mission and Task REST API endpoints

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createApp } from '../../src/server/app.js'
import { MissionManager } from '../../src/core/mission-manager.js'
import { TaskBoard } from '../../src/core/task-board.js'
import type { FastifyInstance } from 'fastify'
import type { Mission } from '../../src/types/mission.types.js'
import type { Task } from '../../src/types/task.types.js'

function createTestMission(): Mission {
  return {
    id: 'api-test-mission',
    goal: 'Test API endpoints',
    context: { topic: 'testing' },
    blueprints: [
      { role: 'tester', instructions: 'Test things', capabilities: ['test'] },
    ],
    phases: [
      {
        id: 'phase-0',
        type: 'parallel',
        taskTemplate: {
          type: 'test',
          instructionTemplate: 'Run tests',
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

describe('API Integration Tests', () => {
  let app: FastifyInstance
  let missionManager: MissionManager
  let taskBoard: TaskBoard

  beforeEach(async () => {
    missionManager = new MissionManager()
    taskBoard = new TaskBoard()
    app = await createApp(
      { logger: false },
      { missionManager, taskBoard }
    )
  })

  afterEach(async () => {
    await app.close()
  })

  // --- Health Check ---

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
      })
      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.status).toBe('ok')
      expect(body.timestamp).toBeDefined()
    })
  })

  // --- Mission API ---

  describe('Mission API', () => {
    it('POST /api/missions should create a mission', async () => {
      const mission = createTestMission()
      const response = await app.inject({
        method: 'POST',
        url: '/api/missions',
        payload: mission,
      })
      expect(response.statusCode).toBe(201)
      const body = JSON.parse(response.body)
      expect(body.mission.id).toBe('api-test-mission')
      expect(body.status).toBe('created')
    })

    it('POST /api/missions should reject missing fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/missions',
        payload: { context: {} },
      })
      expect(response.statusCode).toBe(400)
    })

    it('GET /api/missions should list missions', async () => {
      missionManager.createMission(createTestMission())
      const response = await app.inject({
        method: 'GET',
        url: '/api/missions',
      })
      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(Array.isArray(body)).toBe(true)
      expect(body).toHaveLength(1)
    })

    it('GET /api/missions/:id should return a mission', async () => {
      missionManager.createMission(createTestMission())
      const response = await app.inject({
        method: 'GET',
        url: '/api/missions/api-test-mission',
      })
      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.mission.id).toBe('api-test-mission')
    })

    it('GET /api/missions/:id should return 404 for non-existent', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/missions/non-existent',
      })
      expect(response.statusCode).toBe(404)
    })

    it('PATCH /api/missions/:id/status should update status', async () => {
      missionManager.createMission(createTestMission())
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/missions/api-test-mission/status',
        payload: { status: 'running' },
      })
      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.success).toBe(true)
      expect(body.status).toBe('running')
    })

    it('PATCH /api/missions/:id/status should reject invalid status', async () => {
      missionManager.createMission(createTestMission())
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/missions/api-test-mission/status',
        payload: { status: 'invalid_status' },
      })
      expect(response.statusCode).toBe(400)
    })
  })

  // --- Task API ---

  describe('Task API', () => {
    const testTask: Task = {
      id: 'api-test-task',
      missionId: 'api-test-mission',
      phaseId: 'phase-0',
      type: 'test',
      blueprint: { role: 'tester', instructions: 'Test', capabilities: ['test'] },
      instructions: 'Run the test',
      context: {},
      expectedOutputSchema: {},
      status: 'published',
      retryCount: 0,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 3600000),
    }

    it('GET /api/tasks/available should return available tasks', async () => {
      taskBoard.publish({ ...testTask })
      const response = await app.inject({
        method: 'GET',
        url: '/api/tasks/available',
      })
      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(Array.isArray(body)).toBe(true)
      expect(body).toHaveLength(1)
    })

    it('GET /api/tasks/available should filter by capabilities', async () => {
      taskBoard.publish({ ...testTask })
      taskBoard.publish({
        ...testTask,
        id: 'task-review',
        blueprint: { role: 'reviewer', instructions: 'Review', capabilities: ['review'] },
      })
      const response = await app.inject({
        method: 'GET',
        url: '/api/tasks/available?capabilities=review',
      })
      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body).toHaveLength(1)
      expect(body[0].id).toBe('task-review')
    })

    it('POST /api/tasks/:id/claim should claim a task', async () => {
      taskBoard.publish({ ...testTask })
      const response = await app.inject({
        method: 'POST',
        url: '/api/tasks/api-test-task/claim',
        payload: { workerId: 'worker-1' },
      })
      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.success).toBe(true)
      expect(body.claimedBy).toBe('worker-1')
    })

    it('POST /api/tasks/:id/claim should return 409 for unavailable task', async () => {
      taskBoard.publish({ ...testTask })
      taskBoard.claim('api-test-task', 'worker-1')
      const response = await app.inject({
        method: 'POST',
        url: '/api/tasks/api-test-task/claim',
        payload: { workerId: 'worker-2' },
      })
      expect(response.statusCode).toBe(409)
    })

    it('POST /api/tasks/:id/submit should submit a result', async () => {
      taskBoard.publish({ ...testTask })
      taskBoard.claim('api-test-task', 'worker-1')
      const response = await app.inject({
        method: 'POST',
        url: '/api/tasks/api-test-task/submit',
        payload: {
          result: {
            output: {
              freeformAnalysis: 'Test result',
              score: 0.9,
            },
            metadata: {
              wantsContinue: false,
              confidence: 0.95,
              executionTimeMs: 100,
              agentFramework: 'mastra',
            },
          },
        },
      })
      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.success).toBe(true)
    })

    it('POST /api/tasks/:id/submit should reject missing result', async () => {
      taskBoard.publish({ ...testTask })
      taskBoard.claim('api-test-task', 'worker-1')
      const response = await app.inject({
        method: 'POST',
        url: '/api/tasks/api-test-task/submit',
        payload: {},
      })
      expect(response.statusCode).toBe(400)
    })

    it('GET /api/tasks/:id should return a task', async () => {
      taskBoard.publish({ ...testTask })
      const response = await app.inject({
        method: 'GET',
        url: '/api/tasks/api-test-task',
      })
      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.id).toBe('api-test-task')
    })

    it('GET /api/tasks/:id should return 404 for non-existent', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/tasks/non-existent',
      })
      expect(response.statusCode).toBe(404)
    })
  })
})
