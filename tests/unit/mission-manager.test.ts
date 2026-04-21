import { describe, it, expect, beforeEach } from 'vitest'
import { MissionManager } from '../../src/core/mission-manager.js'
import type { Mission } from '../../src/types/mission.types.js'

function makeMission(id = 'mission-1'): Mission {
  return {
    id,
    goal: 'Test mission',
    context: { topic: 'testing' },
    blueprints: [{ role: 'analyst', instructions: 'Analyze', capabilities: ['analysis'] }],
    phases: [
      {
        id: 'phase-0',
        type: 'parallel',
        taskTemplate: {
          type: 'independent_opinion',
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

describe('MissionManager', () => {
  let manager: MissionManager

  beforeEach(() => {
    manager = new MissionManager()
  })

  describe('createMission', () => {
    it('should create a mission record', () => {
      const mission = makeMission()
      const record = manager.createMission(mission)
      expect(record).toBeDefined()
      expect(record.mission.id).toBe('mission-1')
      expect(record.status).toBe('created')
      expect(record.currentPhaseIndex).toBe(0)
      expect(record.createdAt).toBeInstanceOf(Date)
      expect(record.updatedAt).toBeInstanceOf(Date)
    })

    it('should store the mission for later retrieval', () => {
      const mission = makeMission()
      manager.createMission(mission)
      const retrieved = manager.getMission('mission-1')
      expect(retrieved).toBeDefined()
      expect(retrieved!.mission.goal).toBe('Test mission')
    })
  })

  describe('getMission', () => {
    it('should return undefined for non-existent mission', () => {
      const result = manager.getMission('non-existent')
      expect(result).toBeUndefined()
    })

    it('should return the correct mission', () => {
      manager.createMission(makeMission('mission-1'))
      manager.createMission(makeMission('mission-2'))
      const result = manager.getMission('mission-2')
      expect(result).toBeDefined()
      expect(result!.mission.id).toBe('mission-2')
    })
  })

  describe('updateStatus', () => {
    it('should update mission status', () => {
      manager.createMission(makeMission())
      manager.updateStatus('mission-1', 'running')
      const record = manager.getMission('mission-1')
      expect(record!.status).toBe('running')
    })

    it('should update the updatedAt timestamp', () => {
      manager.createMission(makeMission())
      const before = manager.getMission('mission-1')!.updatedAt
      // Valid transition: created → running
      manager.updateStatus('mission-1', 'running')
      const after = manager.getMission('mission-1')!.updatedAt
      expect(after.getTime()).toBeGreaterThanOrEqual(before.getTime())
    })

    it('should throw when updating non-existent mission', () => {
      expect(() => manager.updateStatus('non-existent', 'running')).toThrow('Mission not found')
    })

    it('should throw on invalid state transition', () => {
      manager.createMission(makeMission())
      // created → completed is not allowed (must go through running first)
      expect(() => manager.updateStatus('mission-1', 'completed')).toThrow('Invalid status transition')
    })

    it('should allow valid state transitions', () => {
      manager.createMission(makeMission())
      manager.updateStatus('mission-1', 'running')
      manager.updateStatus('mission-1', 'completed')
      expect(manager.getMission('mission-1')!.status).toBe('completed')
    })

    it('should not allow transitions from terminal states', () => {
      manager.createMission(makeMission())
      manager.updateStatus('mission-1', 'running')
      manager.updateStatus('mission-1', 'completed')
      expect(() => manager.updateStatus('mission-1', 'running')).toThrow('Invalid status transition')
    })
  })

  describe('listMissions', () => {
    it('should return empty array when no missions', () => {
      expect(manager.listMissions()).toHaveLength(0)
    })

    it('should return all missions', () => {
      manager.createMission(makeMission('mission-1'))
      manager.createMission(makeMission('mission-2'))
      manager.createMission(makeMission('mission-3'))
      const list = manager.listMissions()
      expect(list).toHaveLength(3)
    })

    it('should return a copy (not the internal reference)', () => {
      manager.createMission(makeMission())
      const list1 = manager.listMissions()
      const list2 = manager.listMissions()
      expect(list1).not.toBe(list2)
    })
  })
})
