// SQLite Storage — persistent storage implementation
// Implements StorageProvider interface using a simple file-based JSON store
// (Uses JSON file as lightweight persistence without external SQLite dependency)
// For production use, replace with better-sqlite3 or similar

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import type { Task } from '../types/task.types.js'
import type { InteractionThread } from '../types/thread.types.js'
import type { MissionStatus } from '../types/mission.types.js'
import type { StorageProvider, MissionRecord } from './storage.interface.js'

interface StorageData {
  missions: Record<string, MissionRecord>
  tasks: Record<string, Task>
  threads: Record<string, InteractionThread>
}

export interface FileStorageConfig {
  /** Path to the JSON storage file */
  filePath: string
  /** Auto-save after each write operation (default: true) */
  autoSave?: boolean
}

/**
 * File-based persistent storage implementing StorageProvider.
 * Uses a JSON file for lightweight persistence without external dependencies.
 * Suitable for development, testing, and small-scale deployments.
 */
export class FileStorage implements StorageProvider {
  private data: StorageData = { missions: {}, tasks: {}, threads: {} }
  private filePath: string
  private autoSave: boolean

  constructor(config: FileStorageConfig) {
    this.filePath = config.filePath
    this.autoSave = config.autoSave ?? true
    this.load()
  }

  // ─── Mission Operations ─────────────────────────────────

  async saveMission(mission: MissionRecord): Promise<void> {
    this.data.missions[mission.id] = this.serializeDates(mission)
    this.persist()
  }

  async getMission(missionId: string): Promise<MissionRecord | undefined> {
    const mission = this.data.missions[missionId]
    return mission ? this.deserializeDates(mission) : undefined
  }

  async updateMissionStatus(missionId: string, status: MissionStatus): Promise<void> {
    const mission = this.data.missions[missionId]
    if (mission) {
      mission.status = status
      mission.updatedAt = new Date() as unknown as Date
      this.persist()
    }
  }

  // ─── Task Operations ────────────────────────────────────

  async saveTask(task: Task): Promise<void> {
    this.data.tasks[task.id] = this.serializeDates(task)
    this.persist()
  }

  async getTask(taskId: string): Promise<Task | undefined> {
    const task = this.data.tasks[taskId]
    return task ? this.deserializeDates(task) : undefined
  }

  async updateTask(taskId: string, updates: Partial<Task>): Promise<void> {
    const task = this.data.tasks[taskId]
    if (task) {
      Object.assign(task, this.serializeDates(updates))
      this.persist()
    }
  }

  async getAvailableTasks(capabilities?: string[]): Promise<Task[]> {
    return Object.values(this.data.tasks).filter(t => {
      if (t.status !== 'published') return false
      if (capabilities && t.blueprint.capabilities) {
        return t.blueprint.capabilities.some(c => capabilities.includes(c))
      }
      return true
    }).map(t => this.deserializeDates(t))
  }

  async getTasksByPhase(missionId: string, phaseId: string): Promise<Task[]> {
    return Object.values(this.data.tasks)
      .filter(t => t.missionId === missionId && t.phaseId === phaseId)
      .map(t => this.deserializeDates(t))
  }

  async getExpiredClaimedTasks(): Promise<Task[]> {
    const now = Date.now()
    return Object.values(this.data.tasks)
      .filter(t => t.status === 'claimed' && t.expiresAt && new Date(t.expiresAt).getTime() < now)
      .map(t => this.deserializeDates(t))
  }

  // ─── Thread Operations ──────────────────────────────────

  async saveThread(thread: InteractionThread): Promise<void> {
    this.data.threads[thread.id] = this.serializeDates(thread)
    this.persist()
  }

  async getThread(threadId: string): Promise<InteractionThread | undefined> {
    const thread = this.data.threads[threadId]
    return thread ? this.deserializeDates(thread) : undefined
  }

  async getThreadsByMission(missionId: string): Promise<InteractionThread[]> {
    return Object.values(this.data.threads)
      .filter(t => t.missionId === missionId)
      .map(t => this.deserializeDates(t))
  }

  async getThreadByTaskId(taskId: string): Promise<InteractionThread | undefined> {
    // Search through threads for one containing a round with this task
    for (const thread of Object.values(this.data.threads)) {
      for (const round of thread.rounds) {
        if (round.tasks.some(t => t.id === taskId)) {
          return this.deserializeDates(thread)
        }
      }
    }
    return undefined
  }

  // ─── Persistence ────────────────────────────────────────

  private load(): void {
    if (existsSync(this.filePath)) {
      try {
        const raw = readFileSync(this.filePath, 'utf-8')
        this.data = JSON.parse(raw)
      } catch {
        this.data = { missions: {}, tasks: {}, threads: {} }
      }
    }
  }

  private persist(): void {
    if (!this.autoSave) return
    try {
      const dir = dirname(this.filePath)
      mkdirSync(dir, { recursive: true })
      writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8')
    } catch {
      // Silently fail — caller can check file existence
    }
  }

  /**
   * Force save to disk (useful when autoSave is false).
   */
  save(): void {
    const dir = dirname(this.filePath)
    mkdirSync(dir, { recursive: true })
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8')
  }

  /**
   * Force reload from disk.
   */
  reload(): void {
    this.load()
  }

  // ─── Serialization Helpers ──────────────────────────────

  private serializeDates<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj))
  }

  private deserializeDates<T>(obj: T): T {
    // JSON.parse reviver to convert date strings back to Date objects
    return JSON.parse(JSON.stringify(obj), (_key, value) => {
      if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
        return new Date(value)
      }
      return value
    })
  }
}
