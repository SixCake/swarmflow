// Mission lifecycle management
// Handles creation, execution, and completion of missions

import type { Mission, MissionStatus } from '../types/mission.types.js'

export interface MissionRecord {
  mission: Mission
  status: MissionStatus
  currentPhaseIndex: number
  createdAt: Date
  updatedAt: Date
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

  updateStatus(missionId: string, status: MissionStatus): void {
    const record = this.missions.get(missionId)
    if (record) {
      record.status = status
      record.updatedAt = new Date()
    }
  }

  listMissions(): MissionRecord[] {
    return [...this.missions.values()]
  }
}
