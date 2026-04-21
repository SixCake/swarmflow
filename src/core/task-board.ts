// TaskBoard — task state machine + atomic claim + expiry + heartbeat + events
// Manages task lifecycle: published → claimed → submitted → verified

import type { Task, TaskStatus } from '../types/task.types.js'
import type { TaskResult } from '../types/result.types.js'

// ─── Event System ───────────────────────────────────────────

export type TaskEventType =
  | 'published'
  | 'claimed'
  | 'submitted'
  | 'verified'
  | 'rejected'
  | 'expired'
  | 'failed'

export interface TaskEvent {
  type: TaskEventType
  taskId: string
  timestamp: Date
  previousStatus: TaskStatus
  newStatus: TaskStatus
  workerId?: string
}

export type TaskEventListener = (event: TaskEvent) => void

// ─── Config ─────────────────────────────────────────────────

export interface TaskBoardConfig {
  /** Default claim timeout in ms (default: 5 minutes) */
  claimTimeoutMs?: number
  /** Max retry count before marking task as failed (default: 3) */
  maxRetries?: number
}

const DEFAULT_CONFIG: Required<TaskBoardConfig> = {
  claimTimeoutMs: 5 * 60 * 1000,
  maxRetries: 3,
}

// ─── TaskBoard ──────────────────────────────────────────────

export class TaskBoard {
  private tasks: Map<string, Task> = new Map()
  /** CAS version counter per task for atomic claim */
  private versions: Map<string, number> = new Map()
  /** Last heartbeat timestamp per task */
  private heartbeats: Map<string, Date> = new Map()
  /** Event listeners */
  private listeners: TaskEventListener[] = []
  /** Resolved config */
  private config: Required<TaskBoardConfig>

  constructor(config: TaskBoardConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  // ─── Event System ───────────────────────────────────────

  on(listener: TaskEventListener): void {
    this.listeners.push(listener)
  }

  off(listener: TaskEventListener): void {
    this.listeners = this.listeners.filter(l => l !== listener)
  }

  private emit(event: TaskEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event)
      } catch {
        // Swallow listener errors to avoid breaking the state machine
      }
    }
  }

  // ─── Core Lifecycle ─────────────────────────────────────

  publish(task: Task): void {
    const previousStatus = task.status
    task.status = 'published'
    this.tasks.set(task.id, task)
    this.versions.set(task.id, 0)
    this.emit({
      type: 'published',
      taskId: task.id,
      timestamp: new Date(),
      previousStatus,
      newStatus: 'published',
    })
  }

  getAvailableTasks(capabilities?: string[]): Task[] {
    return [...this.tasks.values()].filter(t => {
      if (t.status !== 'published') return false
      if (capabilities && t.blueprint.capabilities) {
        return t.blueprint.capabilities.some(c => capabilities.includes(c))
      }
      return true
    })
  }

  /**
   * Atomic claim with CAS (Compare-And-Swap).
   * Uses an internal version counter to prevent concurrent claims.
   * Optional `expectedVersion` parameter for explicit CAS.
   */
  claim(taskId: string, workerId: string, expectedVersion?: number): boolean {
    const task = this.tasks.get(taskId)
    if (!task || task.status !== 'published') return false

    // CAS check: if caller provides expectedVersion, it must match
    const currentVersion = this.versions.get(taskId) ?? 0
    if (expectedVersion !== undefined && expectedVersion !== currentVersion) {
      return false // Concurrent modification detected
    }

    const previousStatus = task.status
    task.status = 'claimed'
    task.claimedBy = workerId
    task.claimedAt = new Date()
    this.versions.set(taskId, currentVersion + 1)
    this.heartbeats.set(taskId, new Date())

    this.emit({
      type: 'claimed',
      taskId,
      timestamp: new Date(),
      previousStatus,
      newStatus: 'claimed',
      workerId,
    })
    return true
  }

  submit(taskId: string, result: TaskResult): boolean {
    const task = this.tasks.get(taskId)
    if (!task || task.status !== 'claimed') return false

    const previousStatus = task.status
    task.status = 'submitted'
    task.result = result
    task.submittedAt = new Date()
    this.heartbeats.delete(taskId)

    this.emit({
      type: 'submitted',
      taskId,
      timestamp: new Date(),
      previousStatus,
      newStatus: 'submitted',
      workerId: task.claimedBy,
    })
    return true
  }

  verify(taskId: string): boolean {
    const task = this.tasks.get(taskId)
    if (!task || task.status !== 'submitted') return false

    const previousStatus = task.status
    task.status = 'verified'

    this.emit({
      type: 'verified',
      taskId,
      timestamp: new Date(),
      previousStatus,
      newStatus: 'verified',
    })
    return true
  }

  reject(taskId: string): boolean {
    const task = this.tasks.get(taskId)
    if (!task || task.status !== 'submitted') return false

    const previousStatus = task.status

    // Check maxRetry before re-publishing
    task.retryCount++
    if (task.retryCount >= this.config.maxRetries) {
      task.status = 'cancelled'
      task.claimedBy = undefined
      task.claimedAt = undefined
      task.result = undefined
      task.submittedAt = undefined
      this.emit({
        type: 'failed',
        taskId,
        timestamp: new Date(),
        previousStatus,
        newStatus: 'cancelled',
      })
      return true
    }

    task.status = 'published'
    task.claimedBy = undefined
    task.claimedAt = undefined
    task.result = undefined
    task.submittedAt = undefined

    this.emit({
      type: 'rejected',
      taskId,
      timestamp: new Date(),
      previousStatus,
      newStatus: 'published',
    })
    return true
  }

  // ─── Heartbeat ──────────────────────────────────────────

  /**
   * Extend the claim validity for a task.
   * Returns true if the heartbeat was accepted.
   */
  heartbeat(taskId: string): boolean {
    const task = this.tasks.get(taskId)
    if (!task || task.status !== 'claimed') return false
    this.heartbeats.set(taskId, new Date())
    return true
  }

  // ─── Expired Task Handling ──────────────────────────────

  /**
   * Check for claimed tasks that have exceeded the claim timeout
   * (based on last heartbeat or claimedAt) and reset them to published.
   * Returns the number of expired tasks reset.
   */
  handleExpiredTasks(now: Date = new Date()): number {
    let expiredCount = 0

    for (const [taskId, task] of this.tasks) {
      if (task.status !== 'claimed') continue

      const lastActivity = this.heartbeats.get(taskId) ?? task.claimedAt
      if (!lastActivity) continue

      const elapsed = now.getTime() - lastActivity.getTime()
      if (elapsed <= this.config.claimTimeoutMs) continue

      // Task has expired
      const previousStatus = task.status

      task.retryCount++
      if (task.retryCount >= this.config.maxRetries) {
        task.status = 'cancelled'
        task.claimedBy = undefined
        task.claimedAt = undefined
        this.heartbeats.delete(taskId)
        this.emit({
          type: 'failed',
          taskId,
          timestamp: now,
          previousStatus,
          newStatus: 'cancelled',
        })
      } else {
        task.status = 'published'
        task.claimedBy = undefined
        task.claimedAt = undefined
        this.heartbeats.delete(taskId)
        this.emit({
          type: 'expired',
          taskId,
          timestamp: now,
          previousStatus,
          newStatus: 'published',
        })
      }

      expiredCount++
    }

    return expiredCount
  }

  // ─── Queries ────────────────────────────────────────────

  getTask(taskId: string): Task | undefined {
    return this.tasks.get(taskId)
  }

  getTaskVersion(taskId: string): number | undefined {
    return this.versions.get(taskId)
  }

  getTasksByPhase(missionId: string, phaseId: string): Task[] {
    return [...this.tasks.values()].filter(
      t => t.missionId === missionId && t.phaseId === phaseId
    )
  }
}
