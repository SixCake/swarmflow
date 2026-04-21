// Mission lifecycle management
// Handles creation, execution, and completion of missions with state machine validation

import type { Mission, MissionStatus } from '../types/mission.types.js'

export interface MissionRecord {
  mission: Mission
  status: MissionStatus
  currentPhaseIndex: number
  createdAt: Date
  updatedAt: Date
}

// Valid state transitions: created → running → completed/failed/cancelled
// Also: created → cancelled, running → cancelled
const VALID_TRANSITIONS: Record<MissionStatus, MissionStatus[]> = {
  created:   ['running', 'cancelled'],
  running:   ['completed', 'failed', 'cancelled'],
  completed: [],
  failed:    [],
  cancelled: [],
}

export class MissionManager {
  private missions: Map<string, MissionRecord> = new Map()

  createMission(mission: Mission): MissionRecord {
    const record: MissionRecord = {
      mission,
      status: 'created',
      currentPhaseIndex: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    this.missions.set(mission.id, record)
    return record
  }

  getMission(missionId: string): MissionRecord | undefined {
    return this.missions.get(missionId)
  }

  /**
   * Update mission status with state machine validation.
   * Throws if the transition is invalid.
   */
  updateStatus(missionId: string, status: MissionStatus): void {
    const record = this.missions.get(missionId)
    if (!record) {
      throw new Error(`Mission not found: ${missionId}`)
    }
    const allowed = VALID_TRANSITIONS[record.status]
    if (!allowed.includes(status)) {
      throw new Error(
        `Invalid status transition: ${record.status} → ${status} (allowed: ${allowed.join(', ') || 'none'})`
      )
    }
    record.status = status
    record.updatedAt = new Date()
  }

  // ─── Semantic convenience methods ──────────────────────────

  startMission(missionId: string): void {
    this.updateStatus(missionId, 'running')
  }

  completeMission(missionId: string): void {
    this.updateStatus(missionId, 'completed')
  }

  failMission(missionId: string): void {
    this.updateStatus(missionId, 'failed')
  }

  cancelMission(missionId: string): void {
    this.updateStatus(missionId, 'cancelled')
  }

  // ─── Phase index management ────────────────────────────────

  advancePhase(missionId: string): boolean {
    const record = this.missions.get(missionId)
    if (!record) return false
    if (record.currentPhaseIndex >= record.mission.phases.length - 1) return false
    record.currentPhaseIndex++
    record.updatedAt = new Date()
    return true
  }

  listMissions(): MissionRecord[] {
    return [...this.missions.values()]
  }
}
