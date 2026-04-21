// From design doc Section 3.6

import type { AgentBlueprint } from './mission.types.js'
import type { Task } from './task.types.js'
import type { TaskResult } from './result.types.js'

export type ThreadStatus = 'active' | 'converged'

export interface InteractionThread {
  id: string
  missionId: string
  postTaskId: string
  postAuthor: AgentBlueprint
  participants: AgentBlueprint[]
  rounds: InteractionRound[]
  status: ThreadStatus
}

export interface InteractionRound {
  roundNumber: number
  tasks: Task[]
  results: TaskResult[]
}
