// Worker Thread entry point
// Implements Poll → Claim → Execute → Submit cycle with concurrency control and heartbeat

import type { Task } from '../types/task.types.js'
import type { TaskResult } from '../types/result.types.js'
import { MastraExecutor } from './mastra-executor.js'
import type { MastraExecutorConfig } from './mastra-executor.js'

export interface WorkerConfig {
  /** Base URL for the SwarmFlow REST API (e.g. http://127.0.0.1:3100) */
  apiUrl: string
  /** Bearer token for API authentication */
  agentToken: string
  /** Capabilities this worker can handle (matches AgentBlueprint.capabilities) */
  capabilities: string[]
  /** Polling interval in milliseconds (default: 1000) */
  pollIntervalMs: number
  /** Maximum concurrent tasks this worker can execute (default: 1) */
  maxConcurrentTasks: number
  /** Heartbeat interval in milliseconds (default: 30000) */
  heartbeatIntervalMs?: number
  /** MastraExecutor configuration (agent, retries, etc.) */
  executorConfig?: MastraExecutorConfig
}

export interface WorkerStats {
  tasksCompleted: number
  tasksFailed: number
  activeTasks: number
  isRunning: boolean
}

export class WorkerThread {
  private executor: MastraExecutor
  private running = false
  private pollTimer: NodeJS.Timeout | null = null
  private heartbeatTimers: Map<string, NodeJS.Timeout> = new Map()
  private activeTasks: Set<string> = new Set()
  private stats: WorkerStats = { tasksCompleted: 0, tasksFailed: 0, activeTasks: 0, isRunning: false }
  private workerId: string

  constructor(private config: WorkerConfig) {
    this.executor = new MastraExecutor(config.executorConfig)
    this.workerId = `worker-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  }

  /**
   * Start the worker polling loop.
   * Polls the TaskBoard API for available tasks, claims, executes, and submits results.
   */
  async start(): Promise<void> {
    if (this.running) return
    this.running = true
    this.stats.isRunning = true
    this.schedulePoll()
  }

  /**
   * Stop the worker: cancel polling, cancel heartbeats, wait for active tasks.
   */
  stop(): void {
    this.running = false
    this.stats.isRunning = false

    if (this.pollTimer) {
      clearTimeout(this.pollTimer)
      this.pollTimer = null
    }

    // Cancel all heartbeat timers
    for (const timer of this.heartbeatTimers.values()) {
      clearInterval(timer)
    }
    this.heartbeatTimers.clear()
  }

  /**
   * Whether this worker can accept more tasks.
   */
  isAvailable(): boolean {
    return this.running && this.activeTasks.size < this.config.maxConcurrentTasks
  }

  /**
   * Get worker statistics.
   */
  getStats(): WorkerStats {
    return { ...this.stats, activeTasks: this.activeTasks.size }
  }

  /**
   * Get the worker ID.
   */
  getWorkerId(): string {
    return this.workerId
  }

  /**
   * Execute a single task directly (bypasses polling, useful for testing).
   */
  async executeTask(task: Task): Promise<TaskResult> {
    return this.executor.execute(task)
  }

  // ─── Polling loop ─────────────────────────────────────────

  private schedulePoll(): void {
    if (!this.running) return
    this.pollTimer = setTimeout(async () => {
      await this.pollCycle()
      this.schedulePoll()
    }, this.config.pollIntervalMs)
  }

  private async pollCycle(): Promise<void> {
    if (!this.isAvailable()) return

    try {
      // Poll for available tasks
      const tasks = await this.fetchAvailableTasks()
      if (tasks.length === 0) return

      // Claim and execute tasks up to concurrency limit
      const slotsAvailable = this.config.maxConcurrentTasks - this.activeTasks.size
      const tasksToProcess = tasks.slice(0, slotsAvailable)

      await Promise.all(tasksToProcess.map(task => this.claimAndExecute(task)))
    } catch {
      // Polling errors are non-fatal — will retry on next cycle
    }
  }

  private async claimAndExecute(task: Task): Promise<void> {
    try {
      // Claim the task
      const claimed = await this.claimTask(task.id)
      if (!claimed) return

      // Track active task
      this.activeTasks.add(task.id)
      this.stats.activeTasks = this.activeTasks.size

      // Start heartbeat
      this.startHeartbeat(task.id)

      // Execute
      const result = await this.executor.execute(task)

      // Submit result
      await this.submitResult(task.id, result)

      this.stats.tasksCompleted++
    } catch {
      this.stats.tasksFailed++
    } finally {
      // Cleanup
      this.stopHeartbeat(task.id)
      this.activeTasks.delete(task.id)
      this.stats.activeTasks = this.activeTasks.size
    }
  }

  // ─── Heartbeat ────────────────────────────────────────────

  private startHeartbeat(taskId: string): void {
    const intervalMs = this.config.heartbeatIntervalMs ?? 30_000
    const timer = setInterval(async () => {
      try {
        await this.sendHeartbeat(taskId)
      } catch {
        // Heartbeat failure is non-fatal
      }
    }, intervalMs)
    this.heartbeatTimers.set(taskId, timer)
  }

  private stopHeartbeat(taskId: string): void {
    const timer = this.heartbeatTimers.get(taskId)
    if (timer) {
      clearInterval(timer)
      this.heartbeatTimers.delete(taskId)
    }
  }

  // ─── REST API calls ───────────────────────────────────────

  private async fetchAvailableTasks(): Promise<Task[]> {
    const response = await fetch(`${this.config.apiUrl}/api/tasks/available`, {
      headers: this.buildHeaders(),
    })
    if (!response.ok) return []
    const data = await response.json()
    // API returns either a plain array or { tasks: [...] }
    if (Array.isArray(data)) return data as Task[]
    if (data && Array.isArray((data as Record<string, unknown>).tasks)) {
      return (data as { tasks: Task[] }).tasks
    }
    return []
  }

  private async claimTask(taskId: string): Promise<boolean> {
    const response = await fetch(`${this.config.apiUrl}/api/tasks/${taskId}/claim`, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify({ workerId: this.workerId }),
    })
    return response.ok
  }

  private async submitResult(taskId: string, result: TaskResult): Promise<boolean> {
    const response = await fetch(`${this.config.apiUrl}/api/tasks/${taskId}/submit`, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify({ result }),
    })
    return response.ok
  }

  private async sendHeartbeat(taskId: string): Promise<void> {
    await fetch(`${this.config.apiUrl}/api/tasks/${taskId}/heartbeat`, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify({ workerId: this.workerId }),
    })
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (this.config.agentToken) {
      headers['Authorization'] = `Bearer ${this.config.agentToken}`
    }
    return headers
  }
}
