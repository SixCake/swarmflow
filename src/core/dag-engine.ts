// DAG execution engine
// Manages phase orchestration and thread-level interactive discussions

import type { Mission, PhaseDefinition } from '../types/mission.types.js'
import type { Task } from '../types/task.types.js'
import type { TaskResult } from '../types/result.types.js'
import type { InteractionThread, InteractionRound } from '../types/thread.types.js'

export class DAGEngine {
  private mission: Mission | null = null
  private currentPhaseIndex = 0
  private threads: Map<string, InteractionThread> = new Map()

  async initialize(mission: Mission): Promise<void> {
    this.mission = mission
    this.currentPhaseIndex = 0
    this.threads.clear()
  }

  getCurrentPhase(): PhaseDefinition | undefined {
    return this.mission?.phases[this.currentPhaseIndex]
  }

  async advanceToNextPhase(): Promise<boolean> {
    if (!this.mission) return false
    if (this.currentPhaseIndex >= this.mission.phases.length - 1) return false
    this.currentPhaseIndex++
    return true
  }

  getThread(threadId: string): InteractionThread | undefined {
    return this.threads.get(threadId)
  }

  setThread(thread: InteractionThread): void {
    this.threads.set(thread.id, thread)
  }

  getAllThreads(): InteractionThread[] {
    return [...this.threads.values()]
  }

  isComplete(): boolean {
    if (!this.mission) return true
    return this.currentPhaseIndex >= this.mission.phases.length
  }
}
