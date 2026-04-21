// DAG execution engine
// Manages phase orchestration, task generation, thread creation, and convergence-driven loops

import type { Mission, PhaseDefinition, AgentBlueprint } from '../types/mission.types.js'
import type { Task } from '../types/task.types.js'
import type { TaskResult } from '../types/result.types.js'
import type { InteractionThread, InteractionRound } from '../types/thread.types.js'
import type { ConvergencePolicy } from '../types/convergence.types.js'
import { TaskBoard } from './task-board.js'

export class DAGEngine {
  private mission: Mission | null = null
  private currentPhaseIndex = 0
  private threads: Map<string, InteractionThread> = new Map()
  private taskBoard: TaskBoard
  private convergencePolicy: ConvergencePolicy | null = null

  constructor(taskBoard: TaskBoard) {
    this.taskBoard = taskBoard
  }

  // ─── Initialization ────────────────────────────────────────

  async initialize(mission: Mission, convergencePolicy?: ConvergencePolicy): Promise<void> {
    this.mission = mission
    this.currentPhaseIndex = 0
    this.threads.clear()
    this.convergencePolicy = convergencePolicy ?? null
  }

  getMission(): Mission | null {
    return this.mission
  }

  getCurrentPhase(): PhaseDefinition | undefined {
    return this.mission?.phases[this.currentPhaseIndex]
  }

  getCurrentPhaseIndex(): number {
    return this.currentPhaseIndex
  }

  isComplete(): boolean {
    if (!this.mission) return true
    return this.currentPhaseIndex >= this.mission.phases.length
  }

  // ─── Task Generation ───────────────────────────────────────

  /**
   * Generate tasks for the current phase based on its type.
   * - parallel: one task per AgentBlueprint
   * - interactive: creates threads and first-round discussion tasks
   * - aggregate: one final task per AgentBlueprint
   */
  generateTasksForCurrentPhase(): Task[] {
    const phase = this.getCurrentPhase()
    if (!this.mission || !phase) return []

    switch (phase.type) {
      case 'parallel':
        return this.generateParallelTasks(phase)
      case 'interactive':
        return this.generateInteractiveTasks(phase)
      case 'aggregate':
        return this.generateAggregateTasks(phase)
      default:
        return []
    }
  }

  /**
   * Parallel phase: generate one independent task per AgentBlueprint.
   */
  private generateParallelTasks(phase: PhaseDefinition): Task[] {
    if (!this.mission) return []
    const tasks: Task[] = []

    for (let i = 0; i < this.mission.blueprints.length; i++) {
      const bp = this.mission.blueprints[i]
      const task = this.createTask(
        `${phase.id}-${bp.role}`,
        phase,
        bp,
        this.renderInstructions(phase.taskTemplate.instructionTemplate, bp),
      )
      tasks.push(task)
    }

    return tasks
  }

  /**
   * Interactive phase: create threads and generate first-round discussion tasks.
   * Each agent gets a thread where they are the "post author" and others are participants.
   */
  private generateInteractiveTasks(phase: PhaseDefinition): Task[] {
    if (!this.mission) return []

    // Create threads for this phase (one per agent as post author)
    this.createThreadsForPhase(phase)

    // Generate first round of discussion tasks
    return this.generateNextRoundTasks(phase)
  }

  /**
   * Create InteractionThreads for an interactive phase.
   * One thread per AgentBlueprint — each agent posts, others respond.
   */
  createThreadsForPhase(phase: PhaseDefinition): InteractionThread[] {
    if (!this.mission) return []
    const threads: InteractionThread[] = []

    for (const bp of this.mission.blueprints) {
      const threadId = `${phase.id}-thread-${bp.role}`
      const participants = this.mission.blueprints.filter(b => b.role !== bp.role)

      const thread: InteractionThread = {
        id: threadId,
        missionId: this.mission.id,
        postTaskId: `${phase.id}-${bp.role}`,
        postAuthor: bp,
        participants,
        rounds: [],
        status: 'active',
      }

      this.threads.set(threadId, thread)
      threads.push(thread)
    }

    return threads
  }

  /**
   * Generate the next round of discussion tasks for all active threads in the current phase.
   */
  generateNextRoundTasks(phase?: PhaseDefinition): Task[] {
    const currentPhase = phase ?? this.getCurrentPhase()
    if (!this.mission || !currentPhase) return []

    const tasks: Task[] = []
    const activeThreads = this.getThreadsByPhase(currentPhase.id)
      .filter(t => t.status === 'active')

    for (const thread of activeThreads) {
      const roundNumber = thread.rounds.length + 1

      for (const participant of [thread.postAuthor, ...thread.participants]) {
        const taskId = `${currentPhase.id}-r${roundNumber}-${participant.role}`
        const task = this.createTask(
          taskId,
          currentPhase,
          participant,
          this.renderInstructions(currentPhase.taskTemplate.instructionTemplate, participant),
          thread.id,
        )
        tasks.push(task)
      }
    }

    return tasks
  }

  /**
   * Aggregate phase: generate one final task per AgentBlueprint.
   */
  private generateAggregateTasks(phase: PhaseDefinition): Task[] {
    if (!this.mission) return []
    const tasks: Task[] = []

    for (const bp of this.mission.blueprints) {
      const task = this.createTask(
        `${phase.id}-${bp.role}`,
        phase,
        bp,
        this.renderInstructions(phase.taskTemplate.instructionTemplate, bp),
      )
      tasks.push(task)
    }

    return tasks
  }

  // ─── Phase Transition ──────────────────────────────────────

  /**
   * Check if the current phase is complete based on its transitionRule.
   * - all_completed: all tasks in the phase are verified
   * - convergence: all threads have converged
   * - decision_point: at least one task is verified (for branching)
   */
  isCurrentPhaseComplete(): boolean {
    const phase = this.getCurrentPhase()
    if (!this.mission || !phase) return true

    switch (phase.transitionRule.type) {
      case 'all_completed':
        return this.areAllTasksVerified(phase)
      case 'convergence':
        return this.areAllThreadsConverged(phase)
      case 'decision_point':
        return this.hasAnyTaskVerified(phase)
      default:
        return false
    }
  }

  private areAllTasksVerified(phase: PhaseDefinition): boolean {
    if (!this.mission) return false
    const tasks = this.taskBoard.getTasksByPhase(this.mission.id, phase.id)
    return tasks.length > 0 && tasks.every(t => t.status === 'verified')
  }

  private areAllThreadsConverged(phase: PhaseDefinition): boolean {
    const threads = this.getThreadsByPhase(phase.id)
    return threads.length > 0 && threads.every(t => t.status === 'converged')
  }

  private hasAnyTaskVerified(phase: PhaseDefinition): boolean {
    if (!this.mission) return false
    const tasks = this.taskBoard.getTasksByPhase(this.mission.id, phase.id)
    return tasks.some(t => t.status === 'verified')
  }

  /**
   * Advance to the next phase if the current phase is complete.
   * Returns true if advanced, false if already at the end or not complete.
   */
  async advanceToNextPhase(): Promise<boolean> {
    if (!this.mission) return false
    if (!this.isCurrentPhaseComplete()) return false
    if (this.currentPhaseIndex >= this.mission.phases.length - 1) {
      // Mark as beyond last phase — mission is complete
      this.currentPhaseIndex = this.mission.phases.length
      return false
    }
    this.currentPhaseIndex++
    return true
  }

  // ─── Convergence-Driven Loop ───────────────────────────────

  /**
   * Process completed tasks in the current interactive phase.
   * For each thread, check if the latest round is complete, then:
   * - If convergence policy says continue → generate next round tasks
   * - If converged → mark thread as converged
   *
   * Returns newly generated tasks (empty if no new round needed).
   */
  processInteractiveRound(roundResults: Map<string, TaskResult[]>): Task[] {
    const phase = this.getCurrentPhase()
    if (!this.mission || !phase || phase.type !== 'interactive') return []
    if (!this.convergencePolicy) return []

    const newTasks: Task[] = []

    for (const thread of this.getThreadsByPhase(phase.id)) {
      if (thread.status !== 'active') continue

      const threadResults = roundResults.get(thread.id)
      if (!threadResults || threadResults.length === 0) continue

      // Record the round
      const roundNumber = thread.rounds.length + 1
      const roundTasks = this.taskBoard.getTasksByPhase(this.mission.id, phase.id)
        .filter(t => t.threadId === thread.id && t.id.includes(`-r${roundNumber}-`))

      const round: InteractionRound = {
        roundNumber,
        tasks: roundTasks,
        results: threadResults,
      }
      thread.rounds.push(round)

      // Check convergence
      const shouldContinue = this.convergencePolicy.shouldThreadContinue(thread)

      if (!shouldContinue) {
        thread.status = 'converged'
      }
    }

    // If any threads are still active, generate next round tasks
    const activeThreads = this.getThreadsByPhase(phase.id).filter(t => t.status === 'active')
    if (activeThreads.length > 0) {
      const nextRoundTasks = this.generateNextRoundTasks(phase)
      newTasks.push(...nextRoundTasks)
    }

    return newTasks
  }

  // ─── Thread Management ─────────────────────────────────────

  getThread(threadId: string): InteractionThread | undefined {
    return this.threads.get(threadId)
  }

  setThread(thread: InteractionThread): void {
    this.threads.set(thread.id, thread)
  }

  getAllThreads(): InteractionThread[] {
    return [...this.threads.values()]
  }

  getThreadsByPhase(phaseId: string): InteractionThread[] {
    return [...this.threads.values()].filter(t =>
      t.id.startsWith(`${phaseId}-thread-`)
    )
  }

  // ─── Helpers ───────────────────────────────────────────────

  private createTask(
    id: string,
    phase: PhaseDefinition,
    blueprint: AgentBlueprint,
    instructions: string,
    threadId?: string,
  ): Task {
    if (!this.mission) throw new Error('Mission not initialized')

    return {
      id,
      missionId: this.mission.id,
      phaseId: phase.id,
      threadId,
      type: phase.taskTemplate.type,
      blueprint,
      instructions,
      context: this.mission.context,
      expectedOutputSchema: phase.taskTemplate.expectedOutputSchema,
      status: 'published' as const,
      retryCount: 0,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + (this.mission.config.taskTimeoutMinutes ?? 30) * 60_000),
    }
  }

  private renderInstructions(template: string, blueprint: AgentBlueprint): string {
    let result = template
    result = result.replace(/\{\{role\}\}/g, blueprint.role)
    if (this.mission) {
      for (const [key, value] of Object.entries(this.mission.context)) {
        result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value))
      }
    }
    return result
  }
}
