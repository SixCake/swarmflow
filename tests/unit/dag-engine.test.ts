import { describe, it, expect, beforeEach } from 'vitest'
import { DAGEngine } from '../../src/core/dag-engine.js'
import { TaskBoard } from '../../src/core/task-board.js'
import type { Mission } from '../../src/types/mission.types.js'
import type { InteractionThread } from '../../src/types/thread.types.js'

function makeMission(phaseCount = 3): Mission {
  return {
    id: 'mission-1',
    goal: 'Test mission',
    context: { topic: 'testing' },
    blueprints: [
      { role: 'analyst', instructions: 'Analyze', capabilities: ['analysis'] },
      { role: 'reviewer', instructions: 'Review', capabilities: ['review'] },
    ],
    phases: Array.from({ length: phaseCount }, (_, i) => ({
      id: `phase-${i}`,
      type: 'parallel' as const,
      taskTemplate: {
        type: 'independent_opinion',
        instructionTemplate: 'Analyze the topic as {{role}}',
        expectedOutputSchema: {},
      },
      transitionRule: { type: 'all_completed' as const },
    })),
    convergencePolicy: 'fixedRounds',
    config: {
      maxConcurrentTasks: 10,
      taskTimeoutMinutes: 30,
      maxRetries: 3,
      claimExpiryMinutes: 5,
    },
  }
}

function makeThread(id: string): InteractionThread {
  return {
    id,
    missionId: 'mission-1',
    postTaskId: 'task-1',
    postAuthor: { role: 'author', instructions: 'Write' },
    participants: [],
    rounds: [],
    status: 'active',
  }
}

/** Helper: publish, claim, submit, verify all tasks for a phase */
function completeAllPhaseTasks(taskBoard: TaskBoard, missionId: string, phaseId: string): void {
  const tasks = taskBoard.getTasksByPhase(missionId, phaseId)
  for (const task of tasks) {
    if (task.status === 'published') {
      taskBoard.claim(task.id, 'worker-1')
      taskBoard.submit(task.id, {
        output: { freeformAnalysis: 'Done', score: 0.8 },
        metadata: { wantsContinue: false, confidence: 0.9, executionTimeMs: 50, agentFramework: 'mastra' },
      })
      taskBoard.verify(task.id)
    }
  }
}

describe('DAGEngine', () => {
  let engine: DAGEngine
  let taskBoard: TaskBoard

  beforeEach(() => {
    taskBoard = new TaskBoard()
    engine = new DAGEngine(taskBoard)
  })

  describe('initialize', () => {
    it('should initialize with a mission', async () => {
      const mission = makeMission()
      await engine.initialize(mission)
      expect(engine.getCurrentPhase()).toBeDefined()
      expect(engine.getCurrentPhase()!.id).toBe('phase-0')
    })

    it('should reset state on re-initialization', async () => {
      const mission = makeMission()
      await engine.initialize(mission)

      // Generate and complete phase-0 tasks so we can advance
      const tasks = engine.generateTasksForCurrentPhase()
      tasks.forEach(t => taskBoard.publish(t))
      completeAllPhaseTasks(taskBoard, mission.id, 'phase-0')

      await engine.advanceToNextPhase()
      expect(engine.getCurrentPhase()!.id).toBe('phase-1')

      // Re-initialize should reset
      await engine.initialize(mission)
      expect(engine.getCurrentPhase()!.id).toBe('phase-0')
    })
  })

  describe('getCurrentPhase', () => {
    it('should return undefined before initialization', () => {
      expect(engine.getCurrentPhase()).toBeUndefined()
    })

    it('should return the first phase after initialization', async () => {
      await engine.initialize(makeMission())
      const phase = engine.getCurrentPhase()
      expect(phase).toBeDefined()
      expect(phase!.id).toBe('phase-0')
    })
  })

  describe('advanceToNextPhase', () => {
    it('should advance to the next phase when current is complete', async () => {
      const mission = makeMission(3)
      await engine.initialize(mission)

      // Generate and complete phase-0 tasks
      const tasks = engine.generateTasksForCurrentPhase()
      tasks.forEach(t => taskBoard.publish(t))
      completeAllPhaseTasks(taskBoard, mission.id, 'phase-0')

      const advanced = await engine.advanceToNextPhase()
      expect(advanced).toBe(true)
      expect(engine.getCurrentPhase()!.id).toBe('phase-1')
    })

    it('should return false when current phase is not complete', async () => {
      const mission = makeMission(2)
      await engine.initialize(mission)

      // Generate tasks but don't complete them
      const tasks = engine.generateTasksForCurrentPhase()
      tasks.forEach(t => taskBoard.publish(t))

      const advanced = await engine.advanceToNextPhase()
      expect(advanced).toBe(false)
      expect(engine.getCurrentPhase()!.id).toBe('phase-0')
    })

    it('should return false when at the last phase', async () => {
      const mission = makeMission(2)
      await engine.initialize(mission)

      // Complete phase-0
      let tasks = engine.generateTasksForCurrentPhase()
      tasks.forEach(t => taskBoard.publish(t))
      completeAllPhaseTasks(taskBoard, mission.id, 'phase-0')
      await engine.advanceToNextPhase() // phase-0 → phase-1

      // Complete phase-1
      tasks = engine.generateTasksForCurrentPhase()
      tasks.forEach(t => taskBoard.publish(t))
      completeAllPhaseTasks(taskBoard, mission.id, 'phase-1')

      const advanced = await engine.advanceToNextPhase() // phase-1 → end
      expect(advanced).toBe(false)
      expect(engine.isComplete()).toBe(true)
    })

    it('should return false when not initialized', async () => {
      const advanced = await engine.advanceToNextPhase()
      expect(advanced).toBe(false)
    })
  })

  describe('generateTasksForCurrentPhase', () => {
    it('should generate one task per blueprint for parallel phase', async () => {
      const mission = makeMission(1)
      await engine.initialize(mission)
      const tasks = engine.generateTasksForCurrentPhase()
      expect(tasks).toHaveLength(2) // 2 blueprints
      expect(tasks[0].blueprint.role).toBe('analyst')
      expect(tasks[1].blueprint.role).toBe('reviewer')
      expect(tasks[0].phaseId).toBe('phase-0')
    })

    it('should render instruction templates with role', async () => {
      const mission = makeMission(1)
      await engine.initialize(mission)
      const tasks = engine.generateTasksForCurrentPhase()
      expect(tasks[0].instructions).toContain('analyst')
      expect(tasks[1].instructions).toContain('reviewer')
    })

    it('should generate tasks for interactive phase with threads', async () => {
      const mission: Mission = {
        ...makeMission(1),
        phases: [{
          id: 'discuss',
          type: 'interactive',
          taskTemplate: {
            type: 'comment',
            instructionTemplate: 'Discuss as {{role}}',
            expectedOutputSchema: {},
          },
          transitionRule: { type: 'convergence' },
        }],
      }
      await engine.initialize(mission)
      const tasks = engine.generateTasksForCurrentPhase()

      // 2 threads (one per blueprint), each with 2 participants = 4 tasks
      expect(tasks.length).toBe(4)
      expect(engine.getAllThreads()).toHaveLength(2)
    })

    it('should generate aggregate tasks', async () => {
      const mission: Mission = {
        ...makeMission(1),
        phases: [{
          id: 'conclude',
          type: 'aggregate',
          taskTemplate: {
            type: 'final_stance',
            instructionTemplate: 'Final stance as {{role}}',
            expectedOutputSchema: {},
          },
          transitionRule: { type: 'all_completed' },
        }],
      }
      await engine.initialize(mission)
      const tasks = engine.generateTasksForCurrentPhase()
      expect(tasks).toHaveLength(2)
    })
  })

  describe('thread management', () => {
    it('should set and get a thread', async () => {
      await engine.initialize(makeMission())
      const thread = makeThread('thread-1')
      engine.setThread(thread)
      const retrieved = engine.getThread('thread-1')
      expect(retrieved).toBeDefined()
      expect(retrieved!.id).toBe('thread-1')
    })

    it('should return undefined for non-existent thread', async () => {
      await engine.initialize(makeMission())
      expect(engine.getThread('non-existent')).toBeUndefined()
    })

    it('should get all threads', async () => {
      await engine.initialize(makeMission())
      engine.setThread(makeThread('thread-1'))
      engine.setThread(makeThread('thread-2'))
      const threads = engine.getAllThreads()
      expect(threads).toHaveLength(2)
    })

    it('should clear threads on re-initialization', async () => {
      const mission = makeMission()
      await engine.initialize(mission)
      engine.setThread(makeThread('thread-1'))
      await engine.initialize(mission)
      expect(engine.getAllThreads()).toHaveLength(0)
    })
  })

  describe('isComplete', () => {
    it('should return true when not initialized', () => {
      expect(engine.isComplete()).toBe(true)
    })

    it('should return false when phases remain', async () => {
      await engine.initialize(makeMission(3))
      expect(engine.isComplete()).toBe(false)
    })

    it('should return true when all phases are exhausted', async () => {
      const mission = makeMission(1)
      await engine.initialize(mission)

      // Generate and complete the only phase
      const tasks = engine.generateTasksForCurrentPhase()
      tasks.forEach(t => taskBoard.publish(t))
      completeAllPhaseTasks(taskBoard, mission.id, 'phase-0')

      // Advance past the last phase
      await engine.advanceToNextPhase()
      expect(engine.isComplete()).toBe(true)
    })
  })

  describe('isCurrentPhaseComplete', () => {
    it('should return false when tasks are not all verified', async () => {
      const mission = makeMission(1)
      await engine.initialize(mission)
      const tasks = engine.generateTasksForCurrentPhase()
      tasks.forEach(t => taskBoard.publish(t))
      expect(engine.isCurrentPhaseComplete()).toBe(false)
    })

    it('should return true when all tasks are verified', async () => {
      const mission = makeMission(1)
      await engine.initialize(mission)
      const tasks = engine.generateTasksForCurrentPhase()
      tasks.forEach(t => taskBoard.publish(t))
      completeAllPhaseTasks(taskBoard, mission.id, 'phase-0')
      expect(engine.isCurrentPhaseComplete()).toBe(true)
    })
  })
})
