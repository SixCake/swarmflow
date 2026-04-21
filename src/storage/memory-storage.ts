// In-memory storage implementation
// For MVP and testing purposes

import type { Task } from '../types/task.types.js'
import type { InteractionThread } from '../types/thread.types.js'
import type { StorageProvider, MissionRecord } from './storage.interface.js'
import type { MissionStatus } from '../types/mission.types.js'

export class MemoryStorage implements StorageProvider {
  private missions = new Map<string, MissionRecord>()
  private tasks = new Map<string, Task>()
  private threads = new Map<string, InteractionThread>()

  async saveMission(mission: MissionRecord): Promise<void> {
    this.missions.set(mission.id, { ...mission })
  }

  async getMission(missionId: string): Promise<MissionRecord | undefined> {
    return this.missions.get(missionId)
  }

  async updateMissionStatus(missionId: string, status: MissionStatus): Promise<void> {
    const mission = this.missions.get(missionId)
    if (mission) {
      mission.status = status
      mission.updatedAt = new Date()
    }
  }

  async saveTask(task: Task): Promise<void> {
    this.tasks.set(task.id, { ...task })
  }

  async getTask(taskId: string): Promise<Task | undefined> {
    return this.tasks.get(taskId)
  }

  async updateTask(taskId: string, updates: Partial<Task>): Promise<void> {
    const task = this.tasks.get(taskId)
    if (task) {
      Object.assign(task, updates)
    }
  }

  async getAvailableTasks(capabilities?: string[]): Promise<Task[]> {
    return [...this.tasks.values()].filter(t => {
      if (t.status !== 'published') return false
      if (capabilities && t.blueprint.capabilities) {
        return t.blueprint.capabilities.some(c => capabilities.includes(c))
      }
      return true
    })
  }

  async getTasksByPhase(missionId: string, phaseId: string): Promise<Task[]> {
    return [...this.tasks.values()].filter(
      t => t.missionId === missionId && t.phaseId === phaseId
    )
  }

  async getExpiredClaimedTasks(): Promise<Task[]> {
    const now = new Date()
    return [...this.tasks.values()].filter(
      t => t.status === 'claimed' && t.expiresAt < now
    )
  }

  async saveThread(thread: InteractionThread): Promise<void> {
    this.threads.set(thread.id, { ...thread })
  }

  async getThread(threadId: string): Promise<InteractionThread | undefined> {
    return this.threads.get(threadId)
  }

  async getThreadsByMission(missionId: string): Promise<InteractionThread[]> {
    return [...this.threads.values()].filter(t => t.missionId === missionId)
  }

  async getThreadByTaskId(taskId: string): Promise<InteractionThread | undefined> {
    return [...this.threads.values()].find(t => {
      if (t.postTaskId === taskId) return true
      return t.rounds.some(r => r.tasks.some(task => task.id === taskId))
    })
  }
}
