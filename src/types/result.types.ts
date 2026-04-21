// From design doc Section 3.5 + 11.1

export interface TaskResult {
  output: StructuredAgentOutput
  metadata: ResultMetadata
}

export interface ResultMetadata {
  wantsContinue: boolean
  continueReason?: string
  confidence: number
  executionTimeMs: number
  agentFramework: 'mastra'
  custom?: Record<string, unknown>
}

export interface StructuredAgentOutput {
  score?: number
  stance?: number
  tags?: string[]
  keyArguments?: KeyArgument[]
  freeformAnalysis: string
  [key: string]: unknown
}

export interface KeyArgument {
  point: string
  evidence: string
  category: string
}
