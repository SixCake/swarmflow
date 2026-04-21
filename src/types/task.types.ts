// From design doc Section 3.4

import type { AgentBlueprint } from './mission.types.js'

export type TaskStatus =
  | 'published'
  | 'claimed'
  | 'submitted'
  | 'verified'
  | 'rejected'
  | 'timeout'
  | 'cancelled'

export interface Task {
  id: string
  missionId: string
  phaseId: string
  threadId?: string
  type: string
  blueprint: AgentBlueprint
  instructions: string
  context: Record<string, unknown>
  expectedOutputSchema: Record<string, unknown>
  status: TaskStatus
  claimedBy?: string
  claimedAt?: Date
  result?: TaskResult
  submittedAt?: Date
  retryCount: number
  createdAt: Date
  expiresAt: Date
}

import type { TaskResult } from './result.types.js'
export type { TaskResult }
