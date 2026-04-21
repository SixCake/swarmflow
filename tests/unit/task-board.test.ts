import { describe, it, expect, beforeEach } from 'vitest'
import { TaskBoard } from '../../src/core/task-board.js'
import type { Task } from '../../src/types/task.types.js'
import type { TaskResult } from '../../src/types/result.types.js'

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    missionId: 'mission-1',
    phaseId: 'phase-1',
    type: 'independent_opinion',
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

function makeResult(): TaskResult {
  return {
    output: {
      freeformAnalysis: 'Test analysis result',
      score: 0.85,
      stance: 1,
    },
    metadata: {
      wantsContinue: false,
      confidence: 0.9,
      executionTimeMs: 150,
      agentFramework: 'mastra',
    },
  }
}

describe('TaskBoard', () => {
  let board: TaskBoard

  beforeEach(() => {
    board = new TaskBoard()
  })

  describe('publish', () => {
    it('should publish a task and set status to published', () => {
      const task = makeTask()
      board.publish(task)
      const retrieved = board.getTask('task-1')
      expect(retrieved).toBeDefined()
      expect(retrieved!.status).toBe('published')
    })
  })

  describe('getAvailableTasks', () => {
    it('should return only published tasks', () => {
      board.publish(makeTask({ id: 'task-1' }))
      board.publish(makeTask({ id: 'task-2' }))
      const task3 = makeTask({ id: 'task-3' })
      board.publish(task3)
      board.claim('task-3', 'worker-1')

      const available = board.getAvailableTasks()
      expect(available).toHaveLength(2)
    })

    it('should filter by capabilities', () => {
      board.publish(makeTask({
        id: 'task-1',
        blueprint: { role: 'analyst', instructions: 'Analyze', capabilities: ['analysis'] },
      }))
      board.publish(makeTask({
        id: 'task-2',
        blueprint: { role: 'reviewer', instructions: 'Review', capabilities: ['review'] },
      }))

      const available = board.getAvailableTasks(['review'])
      expect(available).toHaveLength(1)
      expect(available[0].id).toBe('task-2')
    })

    it('should return all published tasks when no capabilities filter', () => {
      board.publish(makeTask({ id: 'task-1' }))
      board.publish(makeTask({ id: 'task-2' }))
      const available = board.getAvailableTasks()
      expect(available).toHaveLength(2)
    })
  })

  describe('claim', () => {
    it('should claim a published task', () => {
      board.publish(makeTask())
      const success = board.claim('task-1', 'worker-1')
      expect(success).toBe(true)
      const task = board.getTask('task-1')
      expect(task!.status).toBe('claimed')
      expect(task!.claimedBy).toBe('worker-1')
      expect(task!.claimedAt).toBeInstanceOf(Date)
    })

    it('should fail to claim a non-existent task', () => {
      const success = board.claim('non-existent', 'worker-1')
      expect(success).toBe(false)
    })

    it('should fail to claim an already claimed task', () => {
      board.publish(makeTask())
      board.claim('task-1', 'worker-1')
      const success = board.claim('task-1', 'worker-2')
      expect(success).toBe(false)
    })
  })

  describe('submit', () => {
    it('should submit a result for a claimed task', () => {
      board.publish(makeTask())
      board.claim('task-1', 'worker-1')
      const success = board.submit('task-1', makeResult())
      expect(success).toBe(true)
      const task = board.getTask('task-1')
      expect(task!.status).toBe('submitted')
      expect(task!.result).toBeDefined()
      expect(task!.submittedAt).toBeInstanceOf(Date)
    })

    it('should fail to submit for a non-claimed task', () => {
      board.publish(makeTask())
      const success = board.submit('task-1', makeResult())
      expect(success).toBe(false)
    })

    it('should fail to submit for a non-existent task', () => {
      const success = board.submit('non-existent', makeResult())
      expect(success).toBe(false)
    })
  })

  describe('verify', () => {
    it('should verify a submitted task', () => {
      board.publish(makeTask())
      board.claim('task-1', 'worker-1')
      board.submit('task-1', makeResult())
      const success = board.verify('task-1')
      expect(success).toBe(true)
      expect(board.getTask('task-1')!.status).toBe('verified')
    })

    it('should fail to verify a non-submitted task', () => {
      board.publish(makeTask())
      board.claim('task-1', 'worker-1')
      const success = board.verify('task-1')
      expect(success).toBe(false)
    })
  })

  describe('reject', () => {
    it('should reject a submitted task and re-publish it', () => {
      board.publish(makeTask())
      board.claim('task-1', 'worker-1')
      board.submit('task-1', makeResult())
      const success = board.reject('task-1')
      expect(success).toBe(true)
      const task = board.getTask('task-1')
      expect(task!.status).toBe('published')
      expect(task!.claimedBy).toBeUndefined()
      expect(task!.result).toBeUndefined()
      expect(task!.retryCount).toBe(1)
    })

    it('should fail to reject a non-submitted task', () => {
      board.publish(makeTask())
      const success = board.reject('task-1')
      expect(success).toBe(false)
    })
  })

  describe('getTasksByPhase', () => {
    it('should return tasks for a specific phase', () => {
      board.publish(makeTask({ id: 'task-1', phaseId: 'phase-1' }))
      board.publish(makeTask({ id: 'task-2', phaseId: 'phase-1' }))
      board.publish(makeTask({ id: 'task-3', phaseId: 'phase-2' }))

      const tasks = board.getTasksByPhase('mission-1', 'phase-1')
      expect(tasks).toHaveLength(2)
      tasks.forEach(t => expect(t.phaseId).toBe('phase-1'))
    })
  })

  describe('full lifecycle', () => {
    it('should complete full task lifecycle: publish → claim → submit → verify', () => {
      const task = makeTask()
      board.publish(task)
      expect(board.getTask('task-1')!.status).toBe('published')

      board.claim('task-1', 'worker-1')
      expect(board.getTask('task-1')!.status).toBe('claimed')

      board.submit('task-1', makeResult())
      expect(board.getTask('task-1')!.status).toBe('submitted')

      board.verify('task-1')
      expect(board.getTask('task-1')!.status).toBe('verified')
    })
  })
})
