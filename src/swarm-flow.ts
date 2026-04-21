// Main SwarmFlow class — public API entry point

import type { Mission } from './types/mission.types.js'
import { MissionManager } from './core/mission-manager.js'
import type { MissionRecord } from './core/mission-manager.js'

export interface SwarmFlowConfig {
  port?: number
  authToken?: string
  workerCount?: number
}

export class SwarmFlow {
  private missionManager: MissionManager
  private config: SwarmFlowConfig

  constructor(config: SwarmFlowConfig = {}) {
    this.missionManager = new MissionManager()
    this.config = config
  }

  createMission(mission: Mission): MissionRecord {
    return this.missionManager.createMission(mission)
  }

  getMission(missionId: string): MissionRecord | undefined {
    return this.missionManager.getMission(missionId)
  }

  listMissions(): MissionRecord[] {
    return this.missionManager.listMissions()
  }
}
