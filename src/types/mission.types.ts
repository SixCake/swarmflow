// From design doc Section 3.1 + 3.2 + 3.3

export interface Mission {
  id: string
  goal: string
  context: Record<string, unknown>
  blueprints: AgentBlueprint[]
  phases: PhaseDefinition[]
  convergencePolicy: ConvergencePolicyType
  config: MissionConfig
}

export interface MissionConfig {
  maxConcurrentTasks: number
  taskTimeoutMinutes: number
  maxRetries: number
  claimExpiryMinutes: number
}

export interface AgentBlueprint {
  role: string
  instructions: string
  capabilities?: string[]
}

export type PhaseType = 'parallel' | 'interactive' | 'aggregate'

export interface PhaseDefinition {
  id: string
  type: PhaseType
  taskTemplate: TaskTemplate
  inputMapping?: InputMapping
  transitionRule: TransitionRule
}

export interface TaskTemplate {
  type: string
  instructionTemplate: string
  expectedOutputSchema: Record<string, unknown>
  contextFields?: string[]
}

export interface InputMapping {
  sourcePhaseId?: string
  fields?: Record<string, string>
}

export type TransitionRuleType = 'all_completed' | 'convergence' | 'decision_point'

export interface TransitionRule {
  type: TransitionRuleType
  config?: Record<string, unknown>
}

export type ConvergencePolicyType = 'mutualIntent' | 'bothAgree' | 'fixedRounds'

export type MissionStatus =
  | 'created'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
