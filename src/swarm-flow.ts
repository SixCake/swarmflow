// Main SwarmFlow class — public API entry point
// Orchestrates DAGEngine, TaskBoard, MissionManager, WorkerPool, and HTTP Server

import type { FastifyInstance } from 'fastify'
import type { Mission } from './types/mission.types.js'
import type { ConvergencePolicy } from './types/convergence.types.js'
import type { TaskResult } from './types/result.types.js'
import { MissionManager } from './core/mission-manager.js'
import type { MissionRecord } from './core/mission-manager.js'
import { TaskBoard } from './core/task-board.js'
import { DAGEngine } from './core/dag-engine.js'
import { MastraExecutor } from './worker/mastra-executor.js'
import { createApp } from './server/app.js'
import { mutualIntent, bothAgree, fixedRounds } from './core/convergence.js'

export interface SwarmFlowConfig {
  port?: number
  authToken?: string
  workerCount?: number
  logger?: boolean
}

export class SwarmFlow {
  private missionManager: MissionManager
  private taskBoard: TaskBoard
  private dagEngine: DAGEngine
  private executor: MastraExecutor
  private config: SwarmFlowConfig
  private server: FastifyInstance | null = null
  private orchestrationLoop: NodeJS.Timeout | null = null

  constructor(config: SwarmFlowConfig = {}) {
    this.missionManager = new MissionManager()
    this.taskBoard = new TaskBoard()
    this.dagEngine = new DAGEngine(this.taskBoard)
    this.executor = new MastraExecutor()
    this.config = config
  }

  // ─── Mission CRUD (unchanged) ──────────────────────────────

  createMission(mission: Mission): MissionRecord {
    return this.missionManager.createMission(mission)
  }

  getMission(missionId: string): MissionRecord | undefined {
    return this.missionManager.getMission(missionId)
  }

  listMissions(): MissionRecord[] {
    return this.missionManager.listMissions()
  }

  // ─── Core accessors (for advanced usage / examples) ────────

  getTaskBoard(): TaskBoard {
    return this.taskBoard
  }

  getDAGEngine(): DAGEngine {
    return this.dagEngine
  }

  getMissionManager(): MissionManager {
    return this.missionManager
  }

  // ─── Orchestration lifecycle ───────────────────────────────

  /**
   * Start a mission: initialize DAGEngine, start HTTP server, generate Phase 1 tasks.
   * Returns the MissionRecord.
   */
  async start(mission: Mission): Promise<MissionRecord> {
    // 1. Create mission record
    const record = this.missionManager.createMission(mission)

    // 2. Resolve convergence policy
    const convergencePolicy = this.resolveConvergencePolicy(mission.convergencePolicy)

    // 3. Initialize DAG engine
    await this.dagEngine.initialize(mission, convergencePolicy)

    // 4. Start HTTP server
    this.server = await createApp(
      {
        auth: this.config.authToken ? { token: this.config.authToken } : undefined,
        logger: this.config.logger ?? false,
      },
      { missionManager: this.missionManager, taskBoard: this.taskBoard }
    )
    const port = this.config.port ?? 3100
    await this.server.listen({ port, host: '127.0.0.1' })

    // 5. Transition to running
    this.missionManager.startMission(mission.id)

    // 6. Generate and publish Phase 1 tasks
    const tasks = this.dagEngine.generateTasksForCurrentPhase()
    for (const task of tasks) {
      this.taskBoard.publish(task)
    }

    return record
  }

  /**
   * Run the full orchestration loop: execute tasks, check convergence, advance phases.
   * This is a blocking call that returns when the mission completes or times out.
   */
  async run(missionId: string, timeoutMs = 300_000): Promise<MissionRecord | undefined> {
    const startTime = Date.now()

    while (Date.now() - startTime < timeoutMs) {
      const record = this.missionManager.getMission(missionId)
      if (!record) return undefined

      // Check terminal states
      if (record.status === 'completed' || record.status === 'failed' || record.status === 'cancelled') {
        return record
      }

      // Execute available tasks
      await this.executeAvailableTasks()

      // Check phase completion and advance
      const advanced = await this.checkAndAdvancePhase(missionId)

      if (this.dagEngine.isComplete()) {
        this.missionManager.completeMission(missionId)
        return this.missionManager.getMission(missionId)
      }

      // If we advanced to a new phase, generate tasks for it
      if (advanced) {
        const newTasks = this.dagEngine.generateTasksForCurrentPhase()
        for (const task of newTasks) {
          this.taskBoard.publish(task)
        }
      }

      // Small delay to prevent tight loop
      await sleep(50)
    }

    // Timeout
    return this.missionManager.getMission(missionId)
  }

  /**
   * Convenience: start + run in one call.
   */
  async startAndRun(mission: Mission, timeoutMs = 300_000): Promise<MissionRecord | undefined> {
    await this.start(mission)
    return this.run(mission.id, timeoutMs)
  }

  /**
   * Wait for a mission to reach a terminal state (polling).
   */
  async waitForCompletion(missionId: string, timeoutMs = 300_000): Promise<MissionRecord | undefined> {
    const startTime = Date.now()
    while (Date.now() - startTime < timeoutMs) {
      const record = this.missionManager.getMission(missionId)
      if (!record) return undefined
      if (record.status === 'completed' || record.status === 'failed' || record.status === 'cancelled') {
        return record
      }
      await sleep(100)
    }
    return this.missionManager.getMission(missionId)
  }

  /**
   * Stop the SwarmFlow instance: close server, clear timers.
   */
  async stop(): Promise<void> {
    if (this.orchestrationLoop) {
      clearInterval(this.orchestrationLoop)
      this.orchestrationLoop = null
    }
    if (this.server) {
      await this.server.close()
      this.server = null
    }
  }

  // ─── Internal orchestration helpers ────────────────────────

  /**
   * Execute all available (published) tasks using the MastraExecutor.
   * Claims, executes, submits, and verifies each task.
   */
  private async executeAvailableTasks(): Promise<void> {
    const available = this.taskBoard.getAvailableTasks()
    const maxConcurrent = this.config.workerCount ?? 4

    // Process in batches
    for (let i = 0; i < available.length; i += maxConcurrent) {
      const batch = available.slice(i, i + maxConcurrent)
      await Promise.all(batch.map(task => this.executeTask(task)))
    }
  }

  private async executeTask(task: import('./types/task.types.js').Task): Promise<void> {
    const workerId = `worker-${task.blueprint.role}`
    const claimed = this.taskBoard.claim(task.id, workerId)
    if (!claimed) return

    try {
      const result = await this.executor.execute(task)
      this.taskBoard.submit(task.id, result)
      this.taskBoard.verify(task.id)
    } catch {
      // On failure, reject so it can be retried
      this.taskBoard.reject(task.id)
    }
  }

  /**
   * Check if the current phase is complete and advance.
   * For interactive phases, handle convergence-driven round generation.
   */
  private async checkAndAdvancePhase(missionId: string): Promise<boolean> {
    const phase = this.dagEngine.getCurrentPhase()
    if (!phase) return false

    // For interactive phases, process convergence
    if (phase.type === 'interactive') {
      return this.processInteractivePhase(missionId, phase)
    }

    // For parallel/aggregate phases, check if all tasks are verified
    if (this.dagEngine.isCurrentPhaseComplete()) {
      const advanced = await this.dagEngine.advanceToNextPhase()
      if (advanced) {
        this.missionManager.advancePhase(missionId)
      }
      return advanced
    }

    return false
  }

  private async processInteractivePhase(
    missionId: string,
    phase: import('./types/mission.types.js').PhaseDefinition
  ): Promise<boolean> {
    const mission = this.dagEngine.getMission()
    if (!mission) return false

    // Collect results by thread for the current round
    const tasks = this.taskBoard.getTasksByPhase(mission.id, phase.id)
    const submittedTasks = tasks.filter(t => t.status === 'verified' && t.threadId)

    // Group results by thread
    const resultsByThread = new Map<string, TaskResult[]>()
    for (const task of submittedTasks) {
      if (!task.threadId || !task.result) continue
      const existing = resultsByThread.get(task.threadId) ?? []
      existing.push(task.result)
      resultsByThread.set(task.threadId, existing)
    }

    // Process convergence and generate next round if needed
    if (resultsByThread.size > 0) {
      const newTasks = this.dagEngine.processInteractiveRound(resultsByThread)
      for (const task of newTasks) {
        this.taskBoard.publish(task)
      }
    }

    // Check if all threads converged → advance phase
    if (this.dagEngine.isCurrentPhaseComplete()) {
      const advanced = await this.dagEngine.advanceToNextPhase()
      if (advanced) {
        this.missionManager.advancePhase(missionId)
      }
      return advanced
    }

    return false
  }

  private resolveConvergencePolicy(policyType: string): ConvergencePolicy {
    switch (policyType) {
      case 'mutualIntent': return mutualIntent
      case 'bothAgree': return bothAgree
      case 'fixedRounds': return fixedRounds(3)
      default: return mutualIntent
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
