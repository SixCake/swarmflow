// WorkerThread integration test
// Tests the full Poll → Claim → Execute → Submit cycle against a real HTTP server

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createApp } from '../../src/server/app.js'
import { MissionManager } from '../../src/core/mission-manager.js'
import { TaskBoard } from '../../src/core/task-board.js'
import { WorkerThread } from '../../src/worker/worker-thread.js'
import type { FastifyInstance } from 'fastify'
import type { Task } from '../../src/types/task.types.js'

const TEST_PORT = 3400

function createTestTask(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    missionId: 'wt-test-mission',
    phaseId: 'phase-0',
    type: 'analysis',
    blueprint: { role: 'analyst', instructions: 'Analyze data', capabilities: ['analysis'] },
    instructions: `Analyze the given data for task ${id}`,
    context: { topic: 'testing' },
    expectedOutputSchema: {},
    status: 'published',
    retryCount: 0,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 3600_000),
    ...overrides,
  }
}

describe('WorkerThread Integration', () => {
  let app: FastifyInstance
  let taskBoard: TaskBoard
  let missionManager: MissionManager

  beforeEach(async () => {
    missionManager = new MissionManager()
    taskBoard = new TaskBoard()
    app = await createApp(
      { logger: false },
      { missionManager, taskBoard },
    )
    await app.listen({ port: TEST_PORT, host: '127.0.0.1' })
  })

  afterEach(async () => {
    await app.close()
  })

  // ─── Direct executeTask ────────────────────────────────────

  describe('executeTask (direct)', () => {
    it('should execute a task and return a valid TaskResult', async () => {
      const worker = new WorkerThread({
        apiUrl: `http://127.0.0.1:${TEST_PORT}`,
        agentToken: '',
        capabilities: ['analysis'],
        pollIntervalMs: 5000,
        maxConcurrentTasks: 1,
      })

      const task = createTestTask('direct-exec-1')
      const result = await worker.executeTask(task)

      expect(result).toBeDefined()
      expect(result.output).toBeDefined()
      expect(result.output.freeformAnalysis).toBeDefined()
      expect(typeof result.output.freeformAnalysis).toBe('string')
      expect(result.metadata).toBeDefined()
      expect(result.metadata.agentFramework).toBe('mastra')
      expect(typeof result.metadata.executionTimeMs).toBe('number')
      expect(typeof result.metadata.confidence).toBe('number')
    })
  })

  // ─── Worker stats ──────────────────────────────────────────

  describe('worker stats', () => {
    it('should track worker stats correctly', () => {
      const worker = new WorkerThread({
        apiUrl: `http://127.0.0.1:${TEST_PORT}`,
        agentToken: '',
        capabilities: ['analysis'],
        pollIntervalMs: 5000,
        maxConcurrentTasks: 2,
      })

      const stats = worker.getStats()
      expect(stats.tasksCompleted).toBe(0)
      expect(stats.tasksFailed).toBe(0)
      expect(stats.activeTasks).toBe(0)
      expect(stats.isRunning).toBe(false)
    })

    it('should report running state after start', async () => {
      const worker = new WorkerThread({
        apiUrl: `http://127.0.0.1:${TEST_PORT}`,
        agentToken: '',
        capabilities: ['analysis'],
        pollIntervalMs: 5000,
        maxConcurrentTasks: 1,
      })

      await worker.start()
      expect(worker.getStats().isRunning).toBe(true)
      expect(worker.isAvailable()).toBe(true)

      worker.stop()
      expect(worker.getStats().isRunning).toBe(false)
      expect(worker.isAvailable()).toBe(false)
    })

    it('should have a unique worker ID', () => {
      const w1 = new WorkerThread({
        apiUrl: `http://127.0.0.1:${TEST_PORT}`,
        agentToken: '',
        capabilities: [],
        pollIntervalMs: 5000,
        maxConcurrentTasks: 1,
      })
      const w2 = new WorkerThread({
        apiUrl: `http://127.0.0.1:${TEST_PORT}`,
        agentToken: '',
        capabilities: [],
        pollIntervalMs: 5000,
        maxConcurrentTasks: 1,
      })
      expect(w1.getWorkerId()).not.toBe(w2.getWorkerId())
    })
  })

  // ─── Polling lifecycle ─────────────────────────────────────

  describe('polling lifecycle', () => {
    it('should poll, claim, execute, and submit a task', async () => {
      // Publish a task to the board
      const task = createTestTask('poll-test-1')
      taskBoard.publish(task)
      expect(taskBoard.getAvailableTasks()).toHaveLength(1)

      // Create a worker with fast polling
      const worker = new WorkerThread({
        apiUrl: `http://127.0.0.1:${TEST_PORT}`,
        agentToken: '',
        capabilities: ['analysis'],
        pollIntervalMs: 100,
        maxConcurrentTasks: 1,
        heartbeatIntervalMs: 60_000, // long heartbeat to avoid noise
      })

      await worker.start()

      // Wait for the worker to pick up and process the task
      await waitFor(() => {
        const t = taskBoard.getTask('poll-test-1')
        return t?.status === 'submitted'
      }, 5000)

      worker.stop()

      // Verify the task was claimed and submitted
      const processed = taskBoard.getTask('poll-test-1')
      expect(processed).toBeDefined()
      expect(processed!.status).toBe('submitted')
      expect(processed!.claimedBy).toBeDefined()
      expect(processed!.result).toBeDefined()
      expect(processed!.result!.output.freeformAnalysis).toBeDefined()

      // Verify worker stats
      const stats = worker.getStats()
      expect(stats.tasksCompleted).toBe(1)
      expect(stats.tasksFailed).toBe(0)
    })

    it('should process multiple tasks sequentially with maxConcurrentTasks=1', async () => {
      // Publish 3 tasks
      for (let i = 1; i <= 3; i++) {
        taskBoard.publish(createTestTask(`seq-task-${i}`))
      }
      expect(taskBoard.getAvailableTasks()).toHaveLength(3)

      const worker = new WorkerThread({
        apiUrl: `http://127.0.0.1:${TEST_PORT}`,
        agentToken: '',
        capabilities: ['analysis'],
        pollIntervalMs: 100,
        maxConcurrentTasks: 1,
        heartbeatIntervalMs: 60_000,
      })

      await worker.start()

      // Wait for all 3 tasks to be submitted
      await waitFor(() => {
        const stats = worker.getStats()
        return stats.tasksCompleted >= 3
      }, 10_000)

      worker.stop()

      // All tasks should be submitted
      for (let i = 1; i <= 3; i++) {
        const t = taskBoard.getTask(`seq-task-${i}`)
        expect(t!.status).toBe('submitted')
        expect(t!.result).toBeDefined()
      }

      expect(worker.getStats().tasksCompleted).toBe(3)
    })

    it('should handle empty task queue gracefully', async () => {
      // No tasks published
      const worker = new WorkerThread({
        apiUrl: `http://127.0.0.1:${TEST_PORT}`,
        agentToken: '',
        capabilities: ['analysis'],
        pollIntervalMs: 100,
        maxConcurrentTasks: 1,
      })

      await worker.start()

      // Wait a few poll cycles
      await sleep(350)

      worker.stop()

      // No tasks should have been processed
      const stats = worker.getStats()
      expect(stats.tasksCompleted).toBe(0)
      expect(stats.tasksFailed).toBe(0)
    })

    it('should stop cleanly and not process tasks after stop', async () => {
      const worker = new WorkerThread({
        apiUrl: `http://127.0.0.1:${TEST_PORT}`,
        agentToken: '',
        capabilities: ['analysis'],
        pollIntervalMs: 100,
        maxConcurrentTasks: 1,
      })

      await worker.start()
      worker.stop()

      // Publish a task after stopping
      taskBoard.publish(createTestTask('after-stop-1'))

      // Wait a bit — worker should not pick it up
      await sleep(300)

      const t = taskBoard.getTask('after-stop-1')
      expect(t!.status).toBe('published') // still unclaimed
    })
  })

  // ─── Concurrent workers ────────────────────────────────────

  describe('concurrent workers', () => {
    it('should allow multiple workers to claim different tasks', async () => {
      // Publish 4 tasks
      for (let i = 1; i <= 4; i++) {
        taskBoard.publish(createTestTask(`concurrent-${i}`))
      }

      const workers = [1, 2].map(() => new WorkerThread({
        apiUrl: `http://127.0.0.1:${TEST_PORT}`,
        agentToken: '',
        capabilities: ['analysis'],
        pollIntervalMs: 100,
        maxConcurrentTasks: 1,
        heartbeatIntervalMs: 60_000,
      }))

      // Start both workers
      await Promise.all(workers.map(w => w.start()))

      // Wait for all tasks to be processed
      await waitFor(() => {
        const total = workers.reduce((sum, w) => sum + w.getStats().tasksCompleted, 0)
        return total >= 4
      }, 10_000)

      // Stop all workers
      workers.forEach(w => w.stop())

      // All tasks should be submitted
      for (let i = 1; i <= 4; i++) {
        const t = taskBoard.getTask(`concurrent-${i}`)
        expect(t!.status).toBe('submitted')
      }

      // Combined stats should show 4 completed
      const totalCompleted = workers.reduce((sum, w) => sum + w.getStats().tasksCompleted, 0)
      expect(totalCompleted).toBe(4)
    })
  })
})

// ─── Helpers ───────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeoutMs: number,
  intervalMs = 50,
): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const result = await condition()
    if (result) return
    await sleep(intervalMs)
  }
  throw new Error(`waitFor timed out after ${timeoutMs}ms`)
}
