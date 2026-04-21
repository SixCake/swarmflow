// Pluggable storage interface
// MVP uses in-memory, future: SQLite, PostgreSQL

import type { Task } from '../types/task.types.js'
import type { InteractionThread } from '../types/thread.types.js'
import type { Mission, MissionStatus } from '../types/mission.types.js'

export interface MissionRecord extends Mission {
  status: MissionStatus
  currentPhaseIndex: number
  createdAt: Date
  updatedAt: Date
}

export interface StorageProvider {
  // Mission operations
  saveMission(mission: MissionRecord): Promise<void>
  getMission(missionId: string): Promise<MissionRecord | undefined>
  updateMissionStatus(missionId: string, status: MissionStatus): Promise<void>

  // Task operations
  saveTask(task: Task): Promise<void>
  getTask(taskId: string): Promise<Task | undefined>
  updateTask(taskId: string, updates: Partial<Task>): Promise<void>
  getAvailableTasks(capabilities?: string[]): Promise<Task[]>
  getTasksByPhase(missionId: string, phaseId: string): Promise<Task[]>
  getExpiredClaimedTasks(): Promise<Task[]>

  // Thread operations
  saveThread(thread: InteractionThread): Promise<void>
  getThread(threadId: string): Promise<InteractionThread | undefined>
  getThreadsByMission(missionId: string): Promise<InteractionThread[]>
  getThreadByTaskId(taskId: string): Promise<InteractionThread | undefined>
}
