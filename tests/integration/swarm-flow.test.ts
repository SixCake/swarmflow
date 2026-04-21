// SwarmFlow main class integration test
// Tests the full orchestration lifecycle: start → run → stop

import { describe, it, expect, afterEach } from 'vitest'
import { SwarmFlow } from '../../src/swarm-flow.js'
import type { Mission } from '../../src/types/mission.types.js'

function createDebateMission(): Mission {
  return {
    id: 'swarmflow-test-debate',
    goal: 'Debate AI regulation',
    context: { topic: 'AI Regulation' },
    blueprints: [
      { role: 'proponent', instructions: 'Argue in favor', capabilities: ['debate'] },
      { role: 'opponent', instructions: 'Argue against', capabilities: ['debate'] },
    ],
    phases: [
      {
        id: 'opening',
        type: 'parallel',
        taskTemplate: {
          type: 'independent_opinion',
          instructionTemplate: 'Share your stance on {{topic}} as {{role}}',
          expectedOutputSchema: {},
        },
        transitionRule: { type: 'all_completed' },
      },
      {
        id: 'closing',
        type: 'aggregate',
        taskTemplate: {
          type: 'final_stance',
          instructionTemplate: 'Final stance on {{topic}} as {{role}}',
          expectedOutputSchema: {},
        },
        transitionRule: { type: 'all_completed' },
      },
    ],
    convergencePolicy: 'mutualIntent',
    config: {
      maxConcurrentTasks: 10,
      taskTimeoutMinutes: 5,
      maxRetries: 3,
      claimExpiryMinutes: 5,
    },
  }
}

function createThreePhaseDebateMission(): Mission {
  return {
    id: 'swarmflow-test-3phase',
    goal: 'Three-phase debate',
    context: { topic: 'Climate Change' },
    blueprints: [
      { role: 'scientist', instructions: 'Present scientific evidence', capabilities: ['science'] },
      { role: 'economist', instructions: 'Analyze economic impact', capabilities: ['economics'] },
    ],
    phases: [
      {
        id: 'research',
        type: 'parallel',
        taskTemplate: {
          type: 'research',
          instructionTemplate: 'Research {{topic}} as {{role}}',
          expectedOutputSchema: {},
        },
        transitionRule: { type: 'all_completed' },
      },
      {
        id: 'discuss',
        type: 'interactive',
        taskTemplate: {
          type: 'comment',
          instructionTemplate: 'Discuss {{topic}} as {{role}}',
          expectedOutputSchema: {},
        },
        transitionRule: { type: 'convergence' },
      },
      {
        id: 'conclude',
        type: 'aggregate',
        taskTemplate: {
          type: 'final_stance',
          instructionTemplate: 'Conclude on {{topic}} as {{role}}',
          expectedOutputSchema: {},
        },
        transitionRule: { type: 'all_completed' },
      },
    ],
    convergencePolicy: 'mutualIntent',
    config: {
      maxConcurrentTasks: 10,
      taskTimeoutMinutes: 5,
      maxRetries: 3,
      claimExpiryMinutes: 5,
    },
  }
}

describe('SwarmFlow Integration', () => {
  let swarm: SwarmFlow

  afterEach(async () => {
    if (swarm) {
      await swarm.stop()
    }
  })

  describe('Mission CRUD', () => {
    it('should create and retrieve missions', () => {
      swarm = new SwarmFlow()
      const mission = createDebateMission()
      const record = swarm.createMission(mission)
      expect(record.status).toBe('created')
      expect(record.mission.id).toBe('swarmflow-test-debate')

      const retrieved = swarm.getMission('swarmflow-test-debate')
      expect(retrieved).toBeDefined()
      expect(retrieved!.mission.goal).toBe('Debate AI regulation')
    })

    it('should list all missions', () => {
      swarm = new SwarmFlow()
      swarm.createMission(createDebateMission())
      swarm.createMission(createThreePhaseDebateMission())
      expect(swarm.listMissions()).toHaveLength(2)
    })
  })

  describe('start()', () => {
    it('should start a mission and transition to running', async () => {
      swarm = new SwarmFlow({ port: 3300, logger: false })
      const mission = createDebateMission()
      const record = await swarm.start(mission)

      expect(record.mission.id).toBe('swarmflow-test-debate')

      // Mission should be running
      const current = swarm.getMission('swarmflow-test-debate')
      expect(current!.status).toBe('running')

      // Phase 1 tasks should be published
      const taskBoard = swarm.getTaskBoard()
      const available = taskBoard.getAvailableTasks()
      expect(available.length).toBeGreaterThanOrEqual(2) // 2 blueprints
    })

    it('should generate tasks with rendered instructions', async () => {
      swarm = new SwarmFlow({ port: 3301, logger: false })
      const mission = createDebateMission()
      await swarm.start(mission)

      const taskBoard = swarm.getTaskBoard()
      const tasks = taskBoard.getAvailableTasks()
      // Instructions should have {{topic}} and {{role}} replaced
      expect(tasks.some(t => t.instructions.includes('AI Regulation'))).toBe(true)
      expect(tasks.some(t => t.instructions.includes('proponent'))).toBe(true)
    })
  })

  describe('run()', () => {
    it('should complete a 2-phase parallel mission', async () => {
      swarm = new SwarmFlow({ port: 3302, logger: false })
      const mission = createDebateMission()
      await swarm.start(mission)

      const result = await swarm.run(mission.id, 10_000)
      expect(result).toBeDefined()
      expect(result!.status).toBe('completed')

      // All tasks should be verified
      const taskBoard = swarm.getTaskBoard()
      const openingTasks = taskBoard.getTasksByPhase(mission.id, 'opening')
      expect(openingTasks.every(t => t.status === 'verified')).toBe(true)

      const closingTasks = taskBoard.getTasksByPhase(mission.id, 'closing')
      expect(closingTasks.every(t => t.status === 'verified')).toBe(true)
    })

    it('should complete a 3-phase mission with interactive discussion', async () => {
      swarm = new SwarmFlow({ port: 3303, logger: false })
      const mission = createThreePhaseDebateMission()
      await swarm.start(mission)

      const result = await swarm.run(mission.id, 15_000)
      expect(result).toBeDefined()
      expect(result!.status).toBe('completed')

      // Research phase tasks should be verified
      const taskBoard = swarm.getTaskBoard()
      const researchTasks = taskBoard.getTasksByPhase(mission.id, 'research')
      expect(researchTasks.length).toBe(2)
      expect(researchTasks.every(t => t.status === 'verified')).toBe(true)

      // Conclude phase tasks should be verified
      const concludeTasks = taskBoard.getTasksByPhase(mission.id, 'conclude')
      expect(concludeTasks.length).toBe(2)
      expect(concludeTasks.every(t => t.status === 'verified')).toBe(true)

      // DAGEngine should be complete
      expect(swarm.getDAGEngine().isComplete()).toBe(true)
    })
  })

  describe('startAndRun()', () => {
    it('should start and run in one call', async () => {
      swarm = new SwarmFlow({ port: 3304, logger: false })
      const mission = createDebateMission()
      const result = await swarm.startAndRun(mission, 10_000)
      expect(result).toBeDefined()
      expect(result!.status).toBe('completed')
    })
  })

  describe('stop()', () => {
    it('should cleanly stop the server', async () => {
      swarm = new SwarmFlow({ port: 3305, logger: false })
      await swarm.start(createDebateMission())
      await swarm.stop()

      // Calling stop again should not throw
      await swarm.stop()
    })
  })

  describe('core accessors', () => {
    it('should expose TaskBoard, DAGEngine, and MissionManager', () => {
      swarm = new SwarmFlow()
      expect(swarm.getTaskBoard()).toBeDefined()
      expect(swarm.getDAGEngine()).toBeDefined()
      expect(swarm.getMissionManager()).toBeDefined()
    })
  })
})
