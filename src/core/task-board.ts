// TaskBoard — task state machine + atomic claim
// Manages task lifecycle: published → claimed → submitted → verified

import type { Task, TaskStatus } from '../types/task.types.js'
import type { TaskResult } from '../types/result.types.js'

export class TaskBoard {
  private tasks: Map<string, Task> = new Map()

  publish(task: Task): void {
    task.status = 'published'
    this.tasks.set(task.id, task)
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

  claim(taskId: string, workerId: string): boolean {
    const task = this.tasks.get(taskId)
    if (!task || task.status !== 'published') return false
    task.status = 'claimed'
    task.claimedBy = workerId
    task.claimedAt = new Date()
    return true
  }

  submit(taskId: string, result: TaskResult): boolean {
    const task = this.tasks.get(taskId)
    if (!task || task.status !== 'claimed') return false
    task.status = 'submitted'
    task.result = result
    task.submittedAt = new Date()
    return true
  }

  verify(taskId: string): boolean {
    const task = this.tasks.get(taskId)
    if (!task || task.status !== 'submitted') return false
    task.status = 'verified'
    return true
  }

  reject(taskId: string): boolean {
    const task = this.tasks.get(taskId)
    if (!task || task.status !== 'submitted') return false
    task.status = 'rejected'
    task.claimedBy = undefined
    task.claimedAt = undefined
    task.result = undefined
    task.submittedAt = undefined
    task.retryCount++
    task.status = 'published'
    return true
  }

  getTask(taskId: string): Task | undefined {
    return this.tasks.get(taskId)
  }

  getTasksByPhase(missionId: string, phaseId: string): Task[] {
    return [...this.tasks.values()].filter(
      t => t.missionId === missionId && t.phaseId === phaseId
    )
  }
}
