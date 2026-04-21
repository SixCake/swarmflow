import { describe, it, expect, beforeEach } from 'vitest'
import { MemoryStorage } from '../../src/storage/memory-storage.js'
import type { MissionRecord } from '../../src/storage/storage.interface.js'
import type { Task } from '../../src/types/task.types.js'
import type { InteractionThread } from '../../src/types/thread.types.js'

describe('MemoryStorage', () => {
  let storage: MemoryStorage

  beforeEach(() => {
    storage = new MemoryStorage()
  })

  // --- Mission operations ---

  describe('Mission operations', () => {
    const baseMission: MissionRecord = {
      id: 'mission-1',
      goal: 'Test mission',
      context: { topic: 'testing' },
      blueprints: [{ role: 'tester', instructions: 'Test things', capabilities: ['test'] }],
      phases: [],
      convergencePolicy: 'fixedRounds',
      config: {
        maxConcurrentTasks: 10,
        taskTimeoutMinutes: 30,
        maxRetries: 3,
        claimExpiryMinutes: 5,
      },
      status: 'created',
      currentPhaseIndex: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    it('should save and retrieve a mission', async () => {
      await storage.saveMission(baseMission)
      const retrieved = await storage.getMission('mission-1')
      expect(retrieved).toBeDefined()
      expect(retrieved!.id).toBe('mission-1')
      expect(retrieved!.goal).toBe('Test mission')
    })

    it('should return undefined for non-existent mission', async () => {
      const result = await storage.getMission('non-existent')
      expect(result).toBeUndefined()
    })

    it('should update mission status', async () => {
      await storage.saveMission(baseMission)
      await storage.updateMissionStatus('mission-1', 'running')
      const retrieved = await storage.getMission('mission-1')
      expect(retrieved!.status).toBe('running')
    })

    it('should not throw when updating non-existent mission', async () => {
      await expect(storage.updateMissionStatus('non-existent', 'running')).resolves.not.toThrow()
    })
  })

  // --- Task operations ---

  describe('Task operations', () => {
    const baseTask: Task = {
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
    }

    it('should save and retrieve a task', async () => {
      await storage.saveTask(baseTask)
      const retrieved = await storage.getTask('task-1')
      expect(retrieved).toBeDefined()
      expect(retrieved!.id).toBe('task-1')
    })

    it('should return undefined for non-existent task', async () => {
      const result = await storage.getTask('non-existent')
      expect(result).toBeUndefined()
    })

    it('should update task fields', async () => {
      await storage.saveTask(baseTask)
      await storage.updateTask('task-1', { status: 'claimed', claimedBy: 'worker-1' })
      const retrieved = await storage.getTask('task-1')
      expect(retrieved!.status).toBe('claimed')
      expect(retrieved!.claimedBy).toBe('worker-1')
    })

    it('should get available tasks (published status)', async () => {
      await storage.saveTask(baseTask)
      await storage.saveTask({ ...baseTask, id: 'task-2', status: 'claimed' })
      const available = await storage.getAvailableTasks()
      expect(available).toHaveLength(1)
      expect(available[0].id).toBe('task-1')
    })

    it('should filter available tasks by capabilities', async () => {
      await storage.saveTask(baseTask)
      await storage.saveTask({
        ...baseTask,
        id: 'task-2',
        blueprint: { role: 'reviewer', instructions: 'Review', capabilities: ['review'] },
      })
      const available = await storage.getAvailableTasks(['review'])
      expect(available).toHaveLength(1)
      expect(available[0].id).toBe('task-2')
    })

    it('should get tasks by phase', async () => {
      await storage.saveTask(baseTask)
      await storage.saveTask({ ...baseTask, id: 'task-2', phaseId: 'phase-2' })
      const tasks = await storage.getTasksByPhase('mission-1', 'phase-1')
      expect(tasks).toHaveLength(1)
      expect(tasks[0].phaseId).toBe('phase-1')
    })

    it('should get expired claimed tasks', async () => {
      const expiredTask: Task = {
        ...baseTask,
        id: 'task-expired',
        status: 'claimed',
        expiresAt: new Date(Date.now() - 1000), // expired 1 second ago
      }
      await storage.saveTask(expiredTask)
      await storage.saveTask(baseTask) // not expired, not claimed
      const expired = await storage.getExpiredClaimedTasks()
      expect(expired).toHaveLength(1)
      expect(expired[0].id).toBe('task-expired')
    })
  })

  // --- Thread operations ---

  describe('Thread operations', () => {
    const baseThread: InteractionThread = {
      id: 'thread-1',
      missionId: 'mission-1',
      postTaskId: 'task-1',
      postAuthor: { role: 'author', instructions: 'Write', capabilities: [] },
      participants: [],
      rounds: [],
      status: 'active',
    }

    it('should save and retrieve a thread', async () => {
      await storage.saveThread(baseThread)
      const retrieved = await storage.getThread('thread-1')
      expect(retrieved).toBeDefined()
      expect(retrieved!.id).toBe('thread-1')
    })

    it('should return undefined for non-existent thread', async () => {
      const result = await storage.getThread('non-existent')
      expect(result).toBeUndefined()
    })

    it('should get threads by mission', async () => {
      await storage.saveThread(baseThread)
      await storage.saveThread({ ...baseThread, id: 'thread-2', missionId: 'mission-2' })
      const threads = await storage.getThreadsByMission('mission-1')
      expect(threads).toHaveLength(1)
      expect(threads[0].missionId).toBe('mission-1')
    })

    it('should get thread by post task id', async () => {
      await storage.saveThread(baseThread)
      const found = await storage.getThreadByTaskId('task-1')
      expect(found).toBeDefined()
      expect(found!.id).toBe('thread-1')
    })

    it('should get thread by round task id', async () => {
      const threadWithRounds: InteractionThread = {
        ...baseThread,
        rounds: [
          {
            roundNumber: 1,
            tasks: [
              {
                id: 'round-task-1',
                missionId: 'mission-1',
                phaseId: 'phase-1',
                type: 'comment',
                blueprint: { role: 'commenter', instructions: 'Comment' },
                instructions: 'Comment on the post',
                context: {},
                expectedOutputSchema: {},
                status: 'published',
                retryCount: 0,
                createdAt: new Date(),
                expiresAt: new Date(Date.now() + 3600000),
              },
            ],
            results: [],
          },
        ],
      }
      await storage.saveThread(threadWithRounds)
      const found = await storage.getThreadByTaskId('round-task-1')
      expect(found).toBeDefined()
      expect(found!.id).toBe('thread-1')
    })

    it('should return undefined when task id not found in any thread', async () => {
      await storage.saveThread(baseThread)
      const found = await storage.getThreadByTaskId('non-existent-task')
      expect(found).toBeUndefined()
    })
  })
})
