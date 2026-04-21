# SwarmFlow MVP Implementation Plan

> Distributed AI Agent task orchestration framework with Mastra Agent integration

## Overview

SwarmFlow is a distributed AI Agent task orchestration framework that orchestrates AI Agents through a TaskBoard API. Agents independently claim tasks, execute them via LLM, and submit structured results. The framework manages phase transitions, discussion threads with convergence, and result aggregation.

### Key Changes from Original Design

This MVP implementation has been adapted to use **@mastra/core** as the primary agent framework instead of direct OpenAI SDK integration. Key modifications include:

- **Tech Stack**: @mastra/core replaces independent OpenAI SDK
- **Project Structure**: `mastra-executor.ts` replaces `llm-adapter.ts`
- **Type Definitions**: `AgentBlueprint` based on Mastra Agent (`import type { Agent } from '@mastra/core/agent'`)
- **Worker Pool**: MastraExecutor handles execution
- **Naming**: All naming uses `InteractionThread` / `AggregationDigest` / `InteractionRound`
- **No stanceShift**: All stance-related logic extracts from `output.stance`
- **Dependencies**: package.json uses `@mastra/core` instead of `openai`

---

## Architecture

```
Mission (what to do)
  → Cortex/DAG Engine (how to orchestrate)
    → TaskBoard API (publish/claim/submit)
      → MastraExecutor (execute via Mastra Agent)
```

### Core Concepts

- **Mission**: Defines goal, agent blueprints, phases, and convergence policy
- **Phase**: `parallel` (independent work) | `interactive` (discussion threads) | `aggregate` (final stance)
- **TaskBoard**: REST API for task lifecycle (publish → claim → submit → verify)
- **InteractionThread**: Thread-level convergence — each post has independent discussion
- **InteractionRound**: Single round of interaction in a thread
- **AggregationDigest**: Aggregated result from multiple agents
- **ConvergencePolicy**: `mutualIntent` | `bothAgree` | `fixedRounds`

---

## Tech Stack

### Core Dependencies

```json
{
  "dependencies": {
    "@mastra/core": "^1.0.0",
    "fastify": "^4.24.3",
    "zod": "^3.22.4",
    "uuid": "^9.0.1"
  },
  "devDependencies": {
    "typescript": "^5.3.3",
    "vitest": "^1.1.0",
    "esbuild": "^0.19.11"
  }
}
```

### Key Technologies

- **@mastra/core**: Agent framework providing `Agent` class and `agent.generate()` API
- **Fastify**: High-performance HTTP server for TaskBoard API
- **Zod**: Runtime type validation and schema definition
- **TypeScript**: Type-safe implementation
- **Vitest**: Fast unit testing framework

---

## Project Structure

```
swarm-flow/
├── src/
│   ├── types/
│   │   ├── index.ts           # Main type exports
│   │   ├── mission.ts         # Mission, Phase, Task types
│   │   ├── thread.ts          # InteractionThread, InteractionRound types
│   │   └── blueprint.ts       # AgentBlueprint types
│   ├── core/
│   │   ├── task-board.ts      # Task state machine
│   │   ├── dag-engine.ts      # Phase transition logic
│   │   ├── digest.ts          # AggregationDigest builder
│   │   ├── convergence.ts     # Convergence policies
│   │   └── schema-validator.ts # Zod validation
│   ├── storage/
│   │   ├── storage.interface.ts # Storage interface
│   │   └── memory-storage.ts    # In-memory implementation
│   ├── worker/
│   │   ├── worker-pool.ts     # Worker pool manager
│   │   └── mastra-executor.ts # Mastra Agent executor
│   ├── server/
│   │   ├── app.ts             # Fastify app & routes
│   │   └── routes.ts          # Route handlers
│   ├── swarm-flow.ts          # Main SwarmFlow class
│   └── index.ts               # Public API exports
├── tests/
│   ├── unit/
│   │   ├── storage.test.ts
│   │   ├── convergence.test.ts
│   │   ├── schema-validator.test.ts
│   │   ├── digest.test.ts
│   │   ├── task-board.test.ts
│   │   ├── dag-engine.test.ts
│   │   └── worker-pool.test.ts
│   └── integration/
│       ├── api.test.ts
│       └── mission-lifecycle.test.ts
├── examples/
│   └── product-evaluation.ts  # CLI demo
├── package.json
├── tsconfig.json
└── README.md
```

---

## Task List

### Task 1: Project Scaffolding

**Goal**: Initialize project structure and dependencies

**Steps**:
1. Create directory structure
2. Initialize `package.json` with @mastra/core dependency
3. Configure `tsconfig.json` for ES modules
4. Set up Vitest configuration
5. Create placeholder files for all modules

**Verification**:
- `npm install` completes successfully
- `npx tsc --noEmit` compiles without errors
- `npx vitest run` runs (even if no tests yet)

---

### Task 2: Type Definitions

**Files**:
- Create: `src/types/index.ts`
- Create: `src/types/mission.ts`
- Create: `src/types/thread.ts`
- Create: `src/types/blueprint.ts`

**Key Types**:

```typescript
// src/types/blueprint.ts
import type { Agent } from '@mastra/core/agent'

export interface AgentBlueprint {
  agent: Agent
  role: string
  capabilities: string[]
}

export interface TaskOutput {
  score?: number
  stance?: number  // -1 to 1, extracted from output
  tags?: string[]
  keyArguments?: Array<{
    point: string
    evidence: string
    category: string
  }>
  freeformAnalysis?: string
}

export interface TaskMetadata {
  wantsContinue?: boolean
  confidence?: number
  executionTimeMs?: number
  agentFramework?: 'mastra'
}

export interface TaskResult {
  output: TaskOutput
  metadata: TaskMetadata
}
```

```typescript
// src/types/thread.ts
export interface InteractionThread {
  id: string
  missionId: string
  topicId: string
  status: 'active' | 'converged'
  createdAt: Date
  updatedAt: Date
}

export interface InteractionRound {
  id: string
  threadId: string
  agentId: string
  content: string
  output: TaskOutput
  metadata: TaskMetadata
  roundNumber: number
  createdAt: Date
}
```

```typescript
// src/types/mission.ts
import type { AgentBlueprint } from './blueprint.js'

export type PhaseType = 'parallel' | 'interactive' | 'aggregate'

export interface Mission {
  id?: string
  goal: string
  context: Record<string, any>
  blueprints: AgentBlueprint[]
  phases: Phase[]
  convergencePolicy: 'mutualIntent' | 'bothAgree' | 'fixedRounds'
  config: MissionConfig
}

export interface Phase {
  id: string
  type: PhaseType
  taskTemplate: TaskTemplate
  transitionRule: TransitionRule
}

export interface TaskTemplate {
  type: string
  instructionTemplate: string
  expectedOutputSchema: Record<string, any>
}

export interface TransitionRule {
  type: 'all_completed' | 'convergence'
  maxRounds?: number
}

export interface MissionConfig {
  maxConcurrentTasks: number
  taskTimeoutMinutes: number
  maxRetries: number
  claimExpiryMinutes: number
}

export interface MissionRecord extends Mission {
  id: string
  status: 'created' | 'running' | 'completed' | 'failed' | 'cancelled'
  currentPhaseIndex: number
  createdAt: Date
  updatedAt: Date
}

export interface Task {
  id: string
  missionId: string
  phaseId: string
  type: string
  instruction: string
  agentId?: string
  status: 'published' | 'claimed' | 'completed' | 'failed' | 'abandoned'
  result?: TaskResult
  claimedAt?: Date
  completedAt?: Date
  claimExpiryAt?: Date
  retryCount: number
  createdAt: Date
  updatedAt: Date
}
```

**Verification**:
- `npx tsc --noEmit` compiles without errors
- All types are properly exported from `src/types/index.ts`

---

### Task 3: Storage Interface + MemoryStorage

**Files**:
- Create: `src/storage/storage.interface.ts`
- Create: `src/storage/memory-storage.ts`
- Create: `tests/unit/storage.test.ts`

**Storage Interface**:

```typescript
// src/storage/storage.interface.ts
import type { MissionRecord, Task, InteractionThread, InteractionRound } from '../types/index.js'

export interface StorageInterface {
  // Mission operations
  createMission(mission: Omit<MissionRecord, 'id' | 'status' | 'currentPhaseIndex' | 'createdAt' | 'updatedAt'>): Promise<MissionRecord>
  getMission(id: string): Promise<MissionRecord | null>
  updateMission(id: string, updates: Partial<MissionRecord>): Promise<void>
  
  // Task operations
  createTask(task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Promise<Task>
  getTask(id: string): Promise<Task | null>
  getTasksByMission(missionId: string): Promise<Task[]>
  getTasksByPhase(missionId: string, phaseId: string): Promise<Task[]>
  getAvailableTasks(capabilities?: string[]): Promise<Task[]>
  updateTask(id: string, updates: Partial<Task>): Promise<void>
  
  // Thread operations
  createThread(thread: Omit<InteractionThread, 'id' | 'createdAt' | 'updatedAt'>): Promise<InteractionThread>
  getThread(id: string): Promise<InteractionThread | null>
  getThreadsByMission(missionId: string): Promise<InteractionThread[]>
  updateThread(id: string, updates: Partial<InteractionThread>): Promise<void>
  
  // Round operations
  createRound(round: Omit<InteractionRound, 'id' | 'createdAt'>): Promise<InteractionRound>
  getRoundsByThread(threadId: string): Promise<InteractionRound[]>
}
```

**MemoryStorage Implementation**:

```typescript
// src/storage/memory-storage.ts
import { v4 as uuidv4 } from 'uuid'
import type { StorageInterface, MissionRecord, Task, InteractionThread, InteractionRound } from './storage.interface.js'

export class MemoryStorage implements StorageInterface {
  private missions = new Map<string, MissionRecord>()
  private tasks = new Map<string, Task>()
  private threads = new Map<string, InteractionThread>()
  private rounds = new Map<string, InteractionRound>()

  async createMission(mission: Omit<MissionRecord, 'id' | 'status' | 'currentPhaseIndex' | 'createdAt' | 'updatedAt'>): Promise<MissionRecord> {
    const record: MissionRecord = {
      ...mission,
      id: uuidv4(),
      status: 'created',
      currentPhaseIndex: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    this.missions.set(record.id, record)
    return record
  }

  async getMission(id: string): Promise<MissionRecord | null> {
    return this.missions.get(id) || null
  }

  async updateMission(id: string, updates: Partial<MissionRecord>): Promise<void> {
    const mission = this.missions.get(id)
    if (mission) {
      this.missions.set(id, { ...mission, ...updates, updatedAt: new Date() })
    }
  }

  async createTask(task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Promise<Task> {
    const newTask: Task = {
      ...task,
      id: uuidv4(),
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    this.tasks.set(newTask.id, newTask)
    return newTask
  }

  async getTask(id: string): Promise<Task | null> {
    return this.tasks.get(id) || null
  }

  async getTasksByMission(missionId: string): Promise<Task[]> {
    return Array.from(this.tasks.values()).filter(t => t.missionId === missionId)
  }

  async getTasksByPhase(missionId: string, phaseId: string): Promise<Task[]> {
    return Array.from(this.tasks.values())
      .filter(t => t.missionId === missionId && t.phaseId === phaseId)
  }

  async getAvailableTasks(capabilities?: string[]): Promise<Task[]> {
    let tasks = Array.from(this.tasks.values()).filter(t => t.status === 'published')
    
    if (capabilities && capabilities.length > 0) {
      // Filter by capabilities (simplified - in real implementation, match agent capabilities)
      tasks = tasks.filter(t => capabilities.some(cap => t.type.includes(cap)))
    }
    
    return tasks
  }

  async updateTask(id: string, updates: Partial<Task>): Promise<void> {
    const task = this.tasks.get(id)
    if (task) {
      this.tasks.set(id, { ...task, ...updates, updatedAt: new Date() })
    }
  }

  async createThread(thread: Omit<InteractionThread, 'id' | 'createdAt' | 'updatedAt'>): Promise<InteractionThread> {
    const newThread: InteractionThread = {
      ...thread,
      id: uuidv4(),
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    this.threads.set(newThread.id, newThread)
    return newThread
  }

  async getThread(id: string): Promise<InteractionThread | null> {
    return this.threads.get(id) || null
  }

  async getThreadsByMission(missionId: string): Promise<InteractionThread[]> {
    return Array.from(this.threads.values()).filter(t => t.missionId === missionId)
  }

  async updateThread(id: string, updates: Partial<InteractionThread>): Promise<void> {
    const thread = this.threads.get(id)
    if (thread) {
      this.threads.set(id, { ...thread, ...updates, updatedAt: new Date() })
    }
  }

  async createRound(round: Omit<InteractionRound, 'id' | 'createdAt'>): Promise<InteractionRound> {
    const newRound: InteractionRound = {
      ...round,
      id: uuidv4(),
      createdAt: new Date(),
    }
    this.rounds.set(newRound.id, newRound)
    return newRound
  }

  async getRoundsByThread(threadId: string): Promise<InteractionRound[]> {
    return Array.from(this.rounds.values())
      .filter(r => r.threadId === threadId)
      .sort((a, b) => a.roundNumber - b.roundNumber)
  }
}
```

**Verification**:
- Unit tests: 10 tests covering all CRUD operations
- All tests pass

---

### Task 4: Convergence Strategies

**Files**:
- Create: `src/core/convergence.ts`
- Create: `tests/unit/convergence.test.ts`

**Implementation**:

```typescript
// src/core/convergence.ts
import type { InteractionThread, InteractionRound } from '../types/index.js'

export type ConvergencePolicy = 'mutualIntent' | 'bothAgree' | 'fixedRounds'

export interface ConvergenceResult {
  converged: boolean
  reason?: string
}

export function mutualIntentPolicy(
  rounds: InteractionRound[],
  maxRounds: number = 5
): ConvergenceResult {
  if (rounds.length === 0) {
    return { converged: false }
  }

  if (rounds.length >= maxRounds) {
    return { converged: true, reason: 'max_rounds_reached' }
  }

  // Check if all agents in the latest round want to stop
  const latestRound = rounds[rounds.length - 1]
  const allWantToStop = rounds
    .filter(r => r.roundNumber === latestRound.roundNumber)
    .every(r => !r.metadata.wantsContinue)

  if (allWantToStop) {
    return { converged: true, reason: 'all_agents_want_to_stop' }
  }

  return { converged: false }
}

export function bothAgreePolicy(
  rounds: InteractionRound[],
  maxRounds: number = 5
): ConvergenceResult {
  if (rounds.length === 0) {
    return { converged: false }
  }

  if (rounds.length >= maxRounds) {
    return { converged: true, reason: 'max_rounds_reached' }
  }

  // Check if all agents have stance > 0 (agree) or all have stance < 0 (disagree)
  const latestRound = rounds.filter(r => r.roundNumber === rounds[rounds.length - 1].roundNumber)
  const allAgree = latestRound.every(r => (r.output.stance || 0) > 0)
  const allDisagree = latestRound.every(r => (r.output.stance || 0) < 0)

  if (allAgree || allDisagree) {
    return { converged: true, reason: allAgree ? 'all_agree' : 'all_disagree' }
  }

  return { converged: false }
}

export function fixedRoundsPolicy(
  rounds: InteractionRound[],
  maxRounds: number = 3
): ConvergenceResult {
  if (rounds.length >= maxRounds) {
    return { converged: true, reason: 'fixed_rounds_completed' }
  }
  return { converged: false }
}

export function getConvergencePolicy(policy: ConvergencePolicy) {
  switch (policy) {
    case 'mutualIntent':
      return mutualIntentPolicy
    case 'bothAgree':
      return bothAgreePolicy
    case 'fixedRounds':
      return fixedRoundsPolicy
    default:
      throw new Error(`Unknown convergence policy: ${policy}`)
  }
}
```

**Verification**:
- Unit tests: 11 tests covering all three policies
- All tests pass

---

### Task 5: Schema Validator

**Files**:
- Create: `src/core/schema-validator.ts`
- Create: `tests/unit/schema-validator.test.ts`

**Implementation**:

```typescript
// src/core/schema-validator.ts
import { z } from 'zod'
import type { TaskResult, TaskOutput, TaskMetadata } from '../types/index.js'

const taskOutputSchema = z.object({
  score: z.number().optional(),
  stance: z.number().min(-1).max(1).optional(),
  tags: z.array(z.string()).optional(),
  keyArguments: z.array(z.object({
    point: z.string(),
    evidence: z.string(),
    category: z.string(),
  })).optional(),
  freeformAnalysis: z.string().optional(),
})

const taskMetadataSchema = z.object({
  wantsContinue: z.boolean().optional(),
  confidence: z.number().min(0).max(1).optional(),
  executionTimeMs: z.number().optional(),
  agentFramework: z.literal('mastra').optional(),
})

const taskResultSchema = z.object({
  output: taskOutputSchema,
  metadata: taskMetadataSchema,
})

export class SchemaValidator {
  validateTaskResult(result: unknown): TaskResult {
    return taskResultSchema.parse(result)
  }

  validateTaskOutput(output: unknown): TaskOutput {
    return taskOutputSchema.parse(output)
  }

  validateTaskMetadata(metadata: unknown): TaskMetadata {
    return taskMetadataSchema.parse(metadata)
  }

  isValidTaskResult(result: unknown): result is TaskResult {
    return taskResultSchema.safeParse(result).success
  }
}
```

**Verification**:
- Unit tests: 6 tests covering validation scenarios
- All tests pass

---

### Task 6: AggregationDigest

**Files**:
- Create: `src/core/digest.ts`
- Create: `tests/unit/digest.test.ts`

**Implementation**:

```typescript
// src/core/digest.ts
import type { TaskResult, TaskOutput } from '../types/index.js'

export interface AggregationDigest {
  averageScore: number
  averageStance: number
  allTags: string[]
  allKeyArguments: Array<{
    point: string
    evidence: string
    category: string
  }>
  consensus: string
  disagreementPoints: string[]
}

export class DigestBuilder {
  buildDigest(results: TaskResult[]): AggregationDigest {
    if (results.length === 0) {
      return this.emptyDigest()
    }

    const outputs = results.map(r => r.output)
    
    return {
      averageScore: this.calculateAverageScore(outputs),
      averageStance: this.calculateAverageStance(outputs),
      allTags: this.collectAllTags(outputs),
      allKeyArguments: this.collectAllKeyArguments(outputs),
      consensus: this.buildConsensus(outputs),
      disagreementPoints: this.findDisagreementPoints(outputs),
    }
  }

  private emptyDigest(): AggregationDigest {
    return {
      averageScore: 0,
      averageStance: 0,
      allTags: [],
      allKeyArguments: [],
      consensus: 'No data available',
      disagreementPoints: [],
    }
  }

  private calculateAverageScore(outputs: TaskOutput[]): number {
    const scores = outputs.map(o => o.score || 0).filter(s => s > 0)
    if (scores.length === 0) return 0
    return scores.reduce((a, b) => a + b, 0) / scores.length
  }

  private calculateAverageStance(outputs: TaskOutput[]): number {
    const stances = outputs.map(o => o.stance || 0)
    if (stances.length === 0) return 0
    return stances.reduce((a, b) => a + b, 0) / stances.length
  }

  private collectAllTags(outputs: TaskOutput[]): string[] {
    const tags = new Set<string>()
    outputs.forEach(o => (o.tags || []).forEach(t => tags.add(t)))
    return Array.from(tags)
  }

  private collectAllKeyArguments(outputs: TaskOutput[]): Array<{
    point: string
    evidence: string
    category: string
  }> {
    const arguments_: Array<{ point: string; evidence: string; category: string }> = []
    outputs.forEach(o => {
      if (o.keyArguments) {
        arguments_.push(...o.keyArguments)
      }
    })
    return arguments_
  }

  private buildConsensus(outputs: TaskOutput[]): string {
    // Simple consensus: average stance determines overall agreement
    const avgStance = this.calculateAverageStance(outputs)
    if (avgStance > 0.3) return 'Overall positive consensus'
    if (avgStance < -0.3) return 'Overall negative consensus'
    return 'Mixed opinions'
  }

  private findDisagreementPoints(outputs: TaskOutput[]): string[] {
    // Find points where stances differ significantly
    const disagreements: string[] = []
    const stances = outputs.map(o => o.stance || 0)
    const avgStance = this.calculateAverageStance(outputs)
    
    outputs.forEach((o, i) => {
      if (Math.abs((o.stance || 0) - avgStance) > 0.5) {
        disagreements.push(`Agent ${i + 1} disagrees with consensus`)
      }
    })
    
    return disagreements
  }
}
```

**Verification**:
- Unit tests: 5 tests covering digest building
- All tests pass

---

### Task 7: TaskBoard State Machine

**Files**:
- Create: `src/core/task-board.ts`
- Create: `tests/unit/task-board.test.ts`

**Implementation**:

```typescript
// src/core/task-board.ts
import type { StorageInterface, Task, TaskResult } from '../types/index.js'
import { SchemaValidator } from './schema-validator.js'

export class TaskBoard {
  constructor(
    private storage: StorageInterface,
    private validator: SchemaValidator
  ) {}

  async claim(taskId: string, workerId: string): Promise<void> {
    const task = await this.storage.getTask(taskId)
    if (!task) {
      throw new Error(`Task ${taskId} not found`)
    }

    if (task.status !== 'published') {
      throw new Error(`Task ${taskId} is not available for claim`)
    }

    const claimExpiryAt = new Date(Date.now() + 15 * 60 * 1000) // 15 minutes

    await this.storage.updateTask(taskId, {
      status: 'claimed',
      claimedAt: new Date(),
      claimExpiryAt,
      retryCount: task.retryCount + 1,
    })
  }

  async submit(taskId: string, workerId: string, result: unknown): Promise<void> {
    const task = await this.storage.getTask(taskId)
    if (!task) {
      throw new Error(`Task ${taskId} not found`)
    }

    if (task.status !== 'claimed') {
      throw new Error(`Task ${taskId} is not claimed`)
    }

    // Validate result
    const validatedResult = this.validator.validateTaskResult(result)

    await this.storage.updateTask(taskId, {
      status: 'completed',
      result: validatedResult,
      completedAt: new Date(),
    })
  }

  async heartbeat(taskId: string, workerId: string): Promise<void> {
    const task = await this.storage.getTask(taskId)
    if (!task) {
      throw new Error(`Task ${taskId} not found`)
    }

    if (task.status !== 'claimed') {
      throw new Error(`Task ${taskId} is not claimed`)
    }

    const claimExpiryAt = new Date(Date.now() + 15 * 60 * 1000) // Extend by 15 minutes

    await this.storage.updateTask(taskId, {
      claimExpiryAt,
    })
  }

  async abandon(taskId: string, workerId: string): Promise<void> {
    const task = await this.storage.getTask(taskId)
    if (!task) {
      throw new Error(`Task ${taskId} not found`)
    }

    if (task.status !== 'claimed') {
      throw new Error(`Task ${taskId} is not claimed`)
    }

    await this.storage.updateTask(taskId, {
      status: 'published',
      claimedAt: undefined,
      claimExpiryAt: undefined,
    })
  }

  async handleExpiredTasks(): Promise<void> {
    const now = new Date()
    const allTasks = await this.storage.getTasksByMission('') // Get all tasks (simplified)

    for (const task of allTasks) {
      if (task.status === 'claimed' && task.claimExpiryAt && task.claimExpiryAt < now) {
        // Check retry count
        if (task.retryCount >= 3) {
          await this.storage.updateTask(task.id, { status: 'failed' })
        } else {
          await this.storage.updateTask(task.id, {
            status: 'published',
            claimedAt: undefined,
            claimExpiryAt: undefined,
          })
        }
      }
    }
  }
}
```

**Verification**:
- Unit tests: 9 tests covering state transitions
- All tests pass

---

### Task 8: DAG Engine

**Files**:
- Create: `src/core/dag-engine.ts`
- Create: `tests/unit/dag-engine.test.ts`

**Implementation**:

```typescript
// src/core/dag-engine.ts
import { v4 as uuidv4 } from 'uuid'
import type { StorageInterface, Mission, MissionRecord, Phase, Task } from '../types/index.js'
import { TaskBoard } from './task-board.js'
import { getConvergencePolicy } from './convergence.js'

export class DAGEngine {
  constructor(
    private storage: StorageInterface,
    private taskBoard: TaskBoard
  ) {}

  async initialize(mission: Mission): Promise<string> {
    // Create mission record
    const record = await this.storage.createMission(mission)
    
    // Create Phase 1 tasks
    const firstPhase = mission.phases[0]
    await this.createTasksForPhase(record.id, firstPhase, mission.blueprints, mission.context)
    
    return record.id
  }

  async processCompletedTasks(missionId: string): Promise<void> {
    const mission = await this.storage.getMission(missionId)
    if (!mission) {
      throw new Error(`Mission ${missionId} not found`)
    }

    const currentPhase = mission.phases[mission.currentPhaseIndex]
    const tasks = await this.storage.getTasksByPhase(missionId, currentPhase.id)

    // Check if phase is complete
    const isComplete = this.checkPhaseComplete(currentPhase, tasks)

    if (isComplete) {
      await this.transitionToNextPhase(mission)
    }
  }

  private async createTasksForPhase(
    missionId: string,
    phase: Phase,
    blueprints: any[],
    context: Record<string, any>
  ): Promise<void> {
    if (phase.type === 'parallel') {
      // Create one task per agent
      for (const blueprint of blueprints) {
        const instruction = this.renderTemplate(phase.taskTemplate.instructionTemplate, {
          ...context,
          role: blueprint.role,
        })

        await this.storage.createTask({
          missionId,
          phaseId: phase.id,
          type: phase.taskTemplate.type,
          instruction,
          agentId: blueprint.agent.id,
          status: 'published',
          retryCount: 0,
        })
      }
    } else if (phase.type === 'interactive') {
      // Create discussion threads
      await this.createInteractiveTasks(missionId, phase, blueprints, context)
    } else if (phase.type === 'aggregate') {
      // Create aggregation task
      const instruction = this.renderTemplate(phase.taskTemplate.instructionTemplate, context)
      
      await this.storage.createTask({
        missionId,
        phaseId: phase.id,
        type: phase.taskTemplate.type,
        instruction,
        status: 'published',
        retryCount: 0,
      })
    }
  }

  private async createInteractiveTasks(
    missionId: string,
    phase: Phase,
    blueprints: any[],
    context: Record<string, any>
  ): Promise<void> {
    // Create threads for each pair of agents
    for (let i = 0; i < blueprints.length; i++) {
      for (let j = 0; j < blueprints.length; j++) {
        if (i === j) continue // Skip self

        const sourceAgent = blueprints[i]
        const targetAgent = blueprints[j]

        const thread = await this.storage.createThread({
          missionId,
          topicId: `${sourceAgent.agent.id}-${targetAgent.agent.id}`,
          status: 'active',
        })

        const instruction = this.renderTemplate(phase.taskTemplate.instructionTemplate, {
          ...context,
          role: sourceAgent.role,
          targetRole: targetAgent.role,
        })

        await this.storage.createTask({
          missionId,
          phaseId: phase.id,
          type: phase.taskTemplate.type,
          instruction,
          agentId: sourceAgent.agent.id,
          status: 'published',
          retryCount: 0,
        })
      }
    }
  }

  private checkPhaseComplete(phase: Phase, tasks: Task[]): boolean {
    if (phase.transitionRule.type === 'all_completed') {
      return tasks.every(t => t.status === 'completed')
    } else if (phase.transitionRule.type === 'convergence') {
      // Check if all threads are converged
      return true // Simplified - in real implementation, check thread convergence
    }
    return false
  }

  private async transitionToNextPhase(mission: MissionRecord): Promise<void> {
    const nextPhaseIndex = mission.currentPhaseIndex + 1

    if (nextPhaseIndex >= mission.phases.length) {
      // Mission complete
      await this.storage.updateMission(mission.id, {
        status: 'completed',
        currentPhaseIndex: nextPhaseIndex,
      })
      return
    }

    const nextPhase = mission.phases[nextPhaseIndex]
    await this.createTasksForPhase(mission.id, nextPhase, mission.blueprints, mission.context)

    await this.storage.updateMission(mission.id, {
      currentPhaseIndex: nextPhaseIndex,
    })
  }

  private renderTemplate(template: string, context: Record<string, any>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => context[key] || '')
  }
}
```

**Verification**:
- Unit tests: 5 tests covering phase transitions
- All tests pass

---

### Task 9: Worker Pool + MastraExecutor

**Files**:
- Create: `src/worker/worker-pool.ts`
- Create: `src/worker/mastra-executor.ts`
- Create: `tests/unit/worker-pool.test.ts`

**MastraExecutor Implementation**:

```typescript
// src/worker/mastra-executor.ts
import type { Agent } from '@mastra/core/agent'
import type { TaskResult, TaskOutput, TaskMetadata } from '../types/index.js'

export class MastraExecutor {
  constructor(
    private agent: Agent,
    private apiKey: string
  ) {}

  async execute(instruction: string, context: Record<string, any> = {}): Promise<TaskResult> {
    const startTime = Date.now()

    try {
      // Use Mastra Agent's generate API
      const response = await this.agent.generate({
        messages: [
          {
            role: 'user',
            content: instruction,
          },
        ],
      })

      // Extract stance from response (no stanceShift, extract from output.stance)
      const output: TaskOutput = {
        score: this.extractScore(response.text),
        stance: this.extractStance(response.text),
        tags: this.extractTags(response.text),
        keyArguments: this.extractKeyArguments(response.text),
        freeformAnalysis: response.text,
      }

      const metadata: TaskMetadata = {
        wantsContinue: this.extractWantsContinue(response.text),
        confidence: 0.8, // Default confidence
        executionTimeMs: Date.now() - startTime,
        agentFramework: 'mastra',
      }

      return { output, metadata }
    } catch (error) {
      throw new Error(`Mastra execution failed: ${error}`)
    }
  }

  private extractScore(text: string): number {
    // Simple extraction - in real implementation, use more sophisticated parsing
    const scoreMatch = text.match(/score[:\s]+(\d+(?:\.\d+)?)/i)
    return scoreMatch ? parseFloat(scoreMatch[1]) : 7.5
  }

  private extractStance(text: string): number {
    // Extract stance from -1 to 1
    const stanceMatch = text.match(/stance[:\s]+(-?\d+(?:\.\d+)?)/i)
    if (stanceMatch) {
      return Math.max(-1, Math.min(1, parseFloat(stanceMatch[1])))
    }
    
    // Simple sentiment analysis fallback
    const positiveWords = ['agree', 'support', 'good', 'excellent', 'positive']
    const negativeWords = ['disagree', 'oppose', 'bad', 'poor', 'negative']
    
    const positiveCount = positiveWords.filter(w => text.toLowerCase().includes(w)).length
    const negativeCount = negativeWords.filter(w => text.toLowerCase().includes(w)).length
    
    if (positiveCount > negativeCount) return 0.5
    if (negativeCount > positiveCount) return -0.5
    return 0
  }

  private extractTags(text: string): string[] {
    const tags: string[] = []
    const tagMatch = text.match(/tags[:\s]+([^\n]+)/i)
    if (tagMatch) {
      return tagMatch[1].split(',').map(t => t.trim())
    }
    return tags
  }

  private extractKeyArguments(text: string): Array<{ point: string; evidence: string; category: string }> {
    const arguments_: Array<{ point: string; evidence: string; category: string }> = []
    // Simple extraction - in real implementation, use more sophisticated parsing
    const pointMatch = text.match(/point[:\s]+([^\n]+)/i)
    const evidenceMatch = text.match(/evidence[:\s]+([^\n]+)/i)
    const categoryMatch = text.match(/category[:\s]+([^\n]+)/i)
    
    if (pointMatch && evidenceMatch && categoryMatch) {
      arguments_.push({
        point: pointMatch[1].trim(),
        evidence: evidenceMatch[1].trim(),
        category: categoryMatch[1].trim(),
      })
    }
    return arguments_
  }

  private extractWantsContinue(text: string): boolean {
    const continueMatch = text.match(/continue[:\s]+(true|false)/i)
    if (continueMatch) {
      return continueMatch[1].toLowerCase() === 'true'
    }
    return false
  }
}
```

**WorkerPool Implementation**:

```typescript
// src/worker/worker-pool.ts
import type { StorageInterface, AgentBlueprint } from '../types/index.js'
import { MastraExecutor } from './mastra-executor.js'

export class WorkerPool {
  private workers: Map<string, MastraExecutor> = new Map()
  private isRunning = false
  private pollInterval?: NodeJS.Timeout

  constructor(
    private storage: StorageInterface,
    private blueprints: AgentBlueprint[],
    private apiKey: string,
    private pollIntervalMs: number = 2000
  ) {}

  async start(): Promise<void> {
    if (this.isRunning) return

    // Initialize workers for each blueprint
    for (const blueprint of this.blueprints) {
      const executor = new MastraExecutor(blueprint.agent, this.apiKey)
      this.workers.set(blueprint.agent.id, executor)
    }

    this.isRunning = true

    // Start polling
    this.pollInterval = setInterval(() => {
      this.pollAndExecute()
    }, this.pollIntervalMs)
  }

  async stop(): Promise<void> {
    this.isRunning = false
    if (this.pollInterval) {
      clearInterval(this.pollInterval)
    }
  }

  private async pollAndExecute(): Promise<void> {
    if (!this.isRunning) return

    // Get available tasks
    const availableTasks = await this.storage.getAvailableTasks()

    for (const task of availableTasks) {
      // Find matching worker
      const worker = this.workers.get(task.agentId || '')
      if (!worker) continue

      try {
        // Claim task
        await this.storage.updateTask(task.id, {
          status: 'claimed',
          claimedAt: new Date(),
        })

        // Execute task
        const result = await worker.execute(task.instruction)

        // Submit result
        await this.storage.updateTask(task.id, {
          status: 'completed',
          result,
          completedAt: new Date(),
        })
      } catch (error) {
        // Mark task as failed
        await this.storage.updateTask(task.id, {
          status: 'failed',
        })
      }
    }
  }
}
```

**Verification**:
- Unit tests: 3 tests covering worker pool operations
- All tests pass

---

### Task 10: HTTP Server (Fastify)

**Files**:
- Create: `src/server/app.ts`
- Create: `src/server/routes.ts`
- Create: `tests/integration/api.test.ts`

**App Implementation**:

```typescript
// src/server/app.ts
import Fastify from 'fastify'
import type { StorageInterface } from '../types/index.js'
import { routes } from './routes.js'

export function createApp(storage: StorageInterface) {
  const app = Fastify({ logger: false })

  // Register routes
  app.register(routes, { storage })

  return app
}

export async function startServer(app: any, port: number): Promise<void> {
  await app.listen({ port, host: '0.0.0.0' })
  console.log(`Server listening on port ${port}`)
}
```

**Routes Implementation**:

```typescript
// src/server/routes.ts
import type { FastifyInstance } from 'fastify'
import type { StorageInterface } from '../types/index.js'

export async function routes(app: FastifyInstance, options: { storage: StorageInterface }) {
  const { storage } = options

  // Get available tasks
  app.get('/tasks/available', async (request, reply) => {
    const { capabilities } = request.query as { capabilities?: string }
    const caps = capabilities ? capabilities.split(',') : undefined
    
    const tasks = await storage.getAvailableTasks(caps)
    return { tasks }
  })

  // Claim a task
  app.post('/tasks/:id/claim', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { workerId } = request.body as { workerId: string }

    const task = await storage.getTask(id)
    if (!task) {
      return reply.code(404).send({ error: 'Task not found' })
    }

    if (task.status !== 'published') {
      return reply.code(409).send({ error: 'Task not available' })
    }

    await storage.updateTask(id, {
      status: 'claimed',
      claimedAt: new Date(),
      claimExpiryAt: new Date(Date.now() + 15 * 60 * 1000),
      retryCount: task.retryCount + 1,
    })

    return { success: true }
  })

  // Submit task result
  app.post('/tasks/:id/submit', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { workerId, result } = request.body as { workerId: string; result: any }

    const task = await storage.getTask(id)
    if (!task) {
      return reply.code(404).send({ error: 'Task not found' })
    }

    if (task.status !== 'claimed') {
      return reply.code(409).send({ error: 'Task not claimed' })
    }

    await storage.updateTask(id, {
      status: 'completed',
      result,
      completedAt: new Date(),
    })

    return { success: true }
  })

  // Heartbeat
  app.post('/tasks/:id/heartbeat', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { workerId } = request.body as { workerId: string }

    const task = await storage.getTask(id)
    if (!task) {
      return reply.code(404).send({ error: 'Task not found' })
    }

    await storage.updateTask(id, {
      claimExpiryAt: new Date(Date.now() + 15 * 60 * 1000),
    })

    return { success: true }
  })

  // Abandon task
  app.post('/tasks/:id/abandon', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { workerId } = request.body as { workerId: string }

    const task = await storage.getTask(id)
    if (!task) {
      return reply.code(404).send({ error: 'Task not found' })
    }

    await storage.updateTask(id, {
      status: 'published',
      claimedAt: undefined,
      claimExpiryAt: undefined,
    })

    return { success: true }
  })

  // Create mission
  app.post('/missions', async (request, reply) => {
    const mission = request.body as any
    const record = await storage.createMission(mission)
    return { missionId: record.id }
  })

  // Get mission progress
  app.get('/missions/:id/progress', async (request, reply) => {
    const { id } = request.params as { id: string }
    const mission = await storage.getMission(id)
    
    if (!mission) {
      return reply.code(404).send({ error: 'Mission not found' })
    }

    const tasks = await storage.getTasksByMission(id)
    const completedTasks = tasks.filter(t => t.status === 'completed').length

    return {
      status: mission.status,
      currentPhase: mission.phases[mission.currentPhaseIndex]?.id,
      totalTasks: tasks.length,
      completedTasks,
    }
  })
}
```

**Verification**:
- Integration tests: 5 tests covering all API endpoints
- All tests pass

---

### Task 11: SwarmFlow Main Class

**Files**:
- Create: `src/swarm-flow.ts`
- Create: `src/index.ts`

**SwarmFlow Implementation**:

```typescript
// src/swarm-flow.ts
import { EventEmitter } from 'events'
import type { Mission, SwarmFlowConfig, MissionRecord } from './types/index.js'
import { MemoryStorage } from './storage/memory-storage.js'
import { TaskBoard } from './core/task-board.js'
import { DAGEngine } from './core/dag-engine.js'
import { SchemaValidator } from './core/schema-validator.js'
import { WorkerPool } from './worker/worker-pool.js'
import { createApp, startServer } from './server/app.js'

export interface SwarmFlowConfig {
  llm: {
    apiKey: string
    model?: string
  }
  port?: number
  workerPollIntervalMs?: number
}

export class SwarmFlow extends EventEmitter {
  private storage: MemoryStorage
  private taskBoard: TaskBoard
  private dagEngine: DAGEngine
  private workerPool?: WorkerPool
  private server?: any
  private expiryChecker?: NodeJS.Timeout

  constructor(private config: SwarmFlowConfig) {
    super()
    
    this.storage = new MemoryStorage()
    const validator = new SchemaValidator()
    this.taskBoard = new TaskBoard(this.storage, validator)
    this.dagEngine = new DAGEngine(this.storage, this.taskBoard)
  }

  async start(mission: Mission): Promise<string> {
    // Initialize mission (creates Phase 1 tasks)
    const record = await this.dagEngine.initialize(mission)

    // Start HTTP server
    const app = createApp(this.storage)
    this.server = app
    await startServer(this.server, this.config.port || 3100)

    // Start workers
    this.workerPool = new WorkerPool(
      this.storage,
      mission.blueprints,
      this.config.llm.apiKey,
      this.config.workerPollIntervalMs || 2000
    )
    await this.workerPool.start()

    // Start expiry checker
    this.startExpiryChecker()

    this.emit('mission_started', { missionId: record.id })
    return record.id
  }

  async waitForCompletion(missionId: string, timeoutMs = 300_000): Promise<MissionRecord | undefined> {
    const startTime = Date.now()
    while (Date.now() - startTime < timeoutMs) {
      const mission = await this.storage.getMission(missionId)
      if (mission && (mission.status === 'completed' || mission.status === 'failed' || mission.status === 'cancelled')) {
        return mission
      }
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
    return undefined
  }

  async stop(): Promise<void> {
    if (this.workerPool) await this.workerPool.stop()
    if (this.server) await this.server.close()
  }

  private startExpiryChecker(): void {
    const interval = setInterval(async () => {
      await this.taskBoard.handleExpiredTasks()
    }, 30_000)
    
    const originalStop = this.stop.bind(this)
    this.stop = async () => {
      clearInterval(interval)
      await originalStop()
    }
  }
}
```

**Index Implementation**:

```typescript
// src/index.ts
// Public API
export { SwarmFlow } from './swarm-flow.js'
export type { SwarmFlowConfig } from './swarm-flow.js'

// Types
export * from './types/index.js'

// Core (for advanced usage)
export { TaskBoard } from './core/task-board.js'
export { DAGEngine } from './core/dag-engine.js'
export { DigestBuilder } from './core/digest.js'
export { SchemaValidator } from './core/schema-validator.js'
export {
  mutualIntentPolicy,
  bothAgreePolicy,
  fixedRoundsPolicy,
  getConvergencePolicy,
} from './core/convergence.js'

// Storage
export type { StorageInterface, MissionRecord } from './storage/storage.interface.js'
export { MemoryStorage } from './storage/memory-storage.js'

// Worker
export { WorkerPool } from './worker/worker-pool.js'
export { MastraExecutor } from './worker/mastra-executor.js'

// Server
export { createApp, startServer } from './server/app.js'
```

**Verification**:
- `npx tsc --noEmit` compiles without errors
- All exports are properly typed

---

### Task 12: Integration Test — Full Mission Lifecycle

**Files**:
- Create: `tests/integration/mission-lifecycle.test.ts`

**Implementation**:

```typescript
// tests/integration/mission-lifecycle.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { Agent } from '@mastra/core/agent'
import { MemoryStorage } from '../../src/storage/memory-storage.js'
import { TaskBoard } from '../../src/core/task-board.js'
import { DAGEngine } from '../../src/core/dag-engine.js'
import { SchemaValidator } from '../../src/core/schema-validator.js'
import type { Mission, MissionRecord } from '../../src/types/index.js'

describe('Mission Lifecycle Integration', () => {
  let storage: MemoryStorage
  let taskBoard: TaskBoard
  let dagEngine: DAGEngine

  beforeEach(() => {
    storage = new MemoryStorage()
    taskBoard = new TaskBoard(storage, new SchemaValidator())
    dagEngine = new DAGEngine(storage, taskBoard)
  })

  it('should complete a full 3-phase mission', async () => {
    const mission = createFullMission()
    await dagEngine.initialize(mission)

    // --- Phase 1: Parallel (evaluate) ---
    let tasks = await storage.getTasksByPhase(mission.id, 'evaluate')
    expect(tasks).toHaveLength(3)

    for (const task of tasks) {
      await taskBoard.claim(task.id, 'w1')
      await taskBoard.submit(task.id, 'w1', createResult(false))
    }
    await dagEngine.processCompletedTasks(mission.id)

    // Verify Phase 2 started
    const missionAfterP1 = await storage.getMission(mission.id)
    expect(missionAfterP1?.currentPhaseIndex).toBe(1)

    // --- Phase 2: Interactive (discuss) ---
    let phase2Tasks = await storage.getTasksByPhase(mission.id, 'discuss')
    expect(phase2Tasks.length).toBe(6) // 3 agents × 2 others each

    // Complete all with wantsContinue=false → immediate convergence
    for (const task of phase2Tasks) {
      if (task.status === 'published') {
        await taskBoard.claim(task.id, 'w1')
        await taskBoard.submit(task.id, 'w1', createResult(false))
      }
    }
    await dagEngine.processCompletedTasks(mission.id)

    // Verify all threads converged
    const threads = await storage.getThreadsByMission(mission.id)
    expect(threads.every(t => t.status === 'converged')).toBe(true)

    // Verify Phase 3 started
    const missionAfterP2 = await storage.getMission(mission.id)
    expect(missionAfterP2?.currentPhaseIndex).toBe(2)

    // --- Phase 3: Parallel (conclude) ---
    const phase3Tasks = await storage.getTasksByPhase(mission.id, 'conclude')
    expect(phase3Tasks).toHaveLength(3)

    for (const task of phase3Tasks) {
      await taskBoard.claim(task.id, 'w1')
      await taskBoard.submit(task.id, 'w1', createResult(false))
    }
    await dagEngine.processCompletedTasks(mission.id)

    // Verify mission completed
    const finalMission = await storage.getMission(mission.id)
    expect(finalMission?.status).toBe('completed')
  })
})

// --- Helpers ---

function createFullMission(): MissionRecord {
  const openai = (model: string) => ({ provider: 'openai', model })
  
  const productArchitect = new Agent({ 
    id: 'product-architect', 
    name: 'Product Architect', 
    instructions: 'Evaluate product', 
    model: openai('gpt-4o-mini') 
  })
  
  const securityExpert = new Agent({ 
    id: 'security-expert', 
    name: 'Security Expert', 
    instructions: 'Evaluate security', 
    model: openai('gpt-4o-mini') 
  })
  
  const businessAnalyst = new Agent({ 
    id: 'business-analyst', 
    name: 'Business Analyst', 
    instructions: 'Evaluate business', 
    model: openai('gpt-4o-mini') 
  })

  return {
    id: 'mission-full',
    goal: 'Evaluate TestApp',
    context: { productName: 'TestApp', productDescription: 'A test application' },
    blueprints: [
      { agent: productArchitect, role: 'Product Architect', capabilities: ['product'] },
      { agent: securityExpert, role: 'Security Expert', capabilities: ['security'] },
      { agent: businessAnalyst, role: 'Business Analyst', capabilities: ['business'] },
    ],
    phases: [
      {
        id: 'evaluate', type: 'parallel',
        taskTemplate: { type: 'evaluate', instructionTemplate: 'Evaluate {{productName}} as {{role}}', expectedOutputSchema: {} },
        transitionRule: { type: 'all_completed' },
      },
      {
        id: 'discuss', type: 'interactive',
        taskTemplate: { type: 'comment', instructionTemplate: 'Comment on {{targetRole}} analysis', expectedOutputSchema: {} },
        transitionRule: { type: 'convergence' },
      },
      {
        id: 'conclude', type: 'parallel',
        taskTemplate: { type: 'final_stance', instructionTemplate: 'Final stance on {{productName}}', expectedOutputSchema: {} },
        transitionRule: { type: 'all_completed' },
      },
    ],
    convergencePolicy: 'mutualIntent',
    config: { maxConcurrentTasks: 100, taskTimeoutMinutes: 30, maxRetries: 3, claimExpiryMinutes: 15 },
    status: 'created',
    currentPhaseIndex: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

function createResult(wantsContinue: boolean) {
  return {
    output: {
      score: 7.5, stance: 0.3, tags: ['good'],
      keyArguments: [{ point: 'Solid foundation', evidence: 'Architecture review', category: 'technical' }],
      freeformAnalysis: 'This is a comprehensive analysis.',
    },
    metadata: {
      wantsContinue, confidence: 0.85,
      executionTimeMs: 5000, agentFramework: 'mastra',
    },
  }
}
```

**Verification**:
- Integration tests: 2 tests covering full mission lifecycle
- All tests pass

---

### Task 13: CLI Demo (Product Evaluation Example)

**Files**:
- Create: `examples/product-evaluation.ts`
- Create: `README.md`

**Demo Implementation**:

```typescript
// examples/product-evaluation.ts
import { Agent } from '@mastra/core/agent'
import { SwarmFlow } from '../src/swarm-flow.js'
import type { Mission } from '../src/types/index.js'

const OPENAI_API_KEY = process.env.OPENAI_API_KEY
if (!OPENAI_API_KEY) {
  console.error('Error: OPENAI_API_KEY environment variable is required')
  process.exit(1)
}

// Create Mastra Agents
const openai = (model: string) => ({ provider: 'openai', model })

const productArchitect = new Agent({ 
  id: 'product-architect', 
  name: '产品架构师', 
  instructions: '你是一位资深产品架构师，擅长分析产品的技术可行性、架构设计和用户体验。请从产品设计、技术实现、用户体验三个维度进行评测。',
  model: openai('gpt-4o-mini') 
})

const educationExpert = new Agent({ 
  id: 'education-expert', 
  name: '教育内容专家', 
  instructions: '你是一位教育科技领域的专家，深谙K12教育规律和AI辅助教学的最佳实践。请从教育效果、内容质量、学习科学三个维度进行评测。',
  model: openai('gpt-4o-mini') 
})

const businessAnalyst = new Agent({ 
  id: 'business-analyst', 
  name: '商业化分析师', 
  instructions: '你是一位商业分析师，擅长市场分析、商业模式评估和竞争格局分析。请从市场规模、商业模式、竞争优势三个维度进行评测。',
  model: openai('gpt-4o-mini') 
})

const mission: Mission = {
  id: '',
  goal: '评测"AI小学学习平台"的产品可行性',
  context: {
    productName: 'AI小学学习平台',
    productDescription: '一个面向6-12岁小学生的AI辅助学习平台，通过自适应学习路径、AI助教和游戏化机制帮助孩子提升学习效果。',
    targetAudience: '6-12岁小学生家长',
    businessModel: '免费试用 + 月度订阅（¥49/月）',
  },
  blueprints: [
    {
      agent: productArchitect,
      role: '产品架构师',
      capabilities: ['product'],
    },
    {
      agent: educationExpert,
      role: '教育内容专家',
      capabilities: ['education'],
    },
    {
      agent: businessAnalyst,
      role: '商业化分析师',
      capabilities: ['business'],
    },
  ],
  phases: [
    {
      id: 'evaluate',
      type: 'parallel',
      taskTemplate: {
        type: 'evaluate',
        instructionTemplate: '请从{{role}}的角度，对"{{productName}}"进行全面评测。\n\n产品描述：{{productDescription}}\n目标用户：{{targetAudience}}\n商业模式：{{businessModel}}\n\n请输出结构化的评测结果。',
        expectedOutputSchema: {},
      },
      transitionRule: { type: 'all_completed' },
    },
    {
      id: 'discuss',
      type: 'interactive',
      taskTemplate: {
        type: 'comment',
        instructionTemplate: '请以{{role}}的身份，评论{{targetRole}}对"{{productName}}"的分析。指出你同意和不同意的地方，并给出你的理由。',
        expectedOutputSchema: {},
      },
      transitionRule: { type: 'convergence' },
    },
    {
      id: 'conclude',
      type: 'parallel',
      taskTemplate: {
        type: 'final_stance',
        instructionTemplate: '基于之前的讨论，请以{{role}}的身份给出你对"{{productName}}"的最终评价和评分。',
        expectedOutputSchema: {},
      },
      transitionRule: { type: 'all_completed' },
    },
  ],
  convergencePolicy: 'mutualIntent',
  config: {
    maxConcurrentTasks: 10,
    taskTimeoutMinutes: 5,
    maxRetries: 2,
    claimExpiryMinutes: 3,
  },
}

async function main() {
  console.log('🐝 SwarmFlow MVP Demo — Product Evaluation')
  console.log('==========================================\n')
  console.log(`📋 Mission: ${mission.goal}`)
  console.log(`👥 Agents: ${mission.blueprints.map(b => b.role).join(', ')}`)
  console.log(`📊 Phases: ${mission.phases.map(p => `${p.id}(${p.type})`).join(' → ')}\n`)

  const swarm = new SwarmFlow({
    llm: {
      apiKey: OPENAI_API_KEY,
      model: 'gpt-4o-mini',
    },
    port: 3100,
    workerPollIntervalMs: 2000,
  })

  try {
    const missionId = await swarm.start(mission)
    console.log(`🚀 Mission started: ${missionId}\n`)

    const result = await swarm.waitForCompletion(missionId, 600_000)
    if (result) {
      console.log(`\n✅ Mission completed with status: ${result.status}`)
    } else {
      console.log('\n⏰ Mission timed out')
    }
  } finally {
    await swarm.stop()
  }
}

main().catch(console.error)
```

**README Implementation**:

```markdown
# SwarmFlow

> Distributed AI Agent task orchestration framework with Mastra Agent integration

SwarmFlow orchestrates AI Agents through a TaskBoard API. Agents independently claim tasks, execute them via Mastra Agent, and submit structured results. The framework manages phase transitions, discussion threads with convergence, and result aggregation.

## Quick Start

```bash
# Install dependencies
npm install

# Set your OpenAI API key
export OPENAI_API_KEY=sk-...

# Run the demo
npm run demo
```

## Architecture

```
Mission (what to do)
  → Cortex/DAG Engine (how to orchestrate)
    → TaskBoard API (publish/claim/submit)
      → MastraExecutor (execute via Mastra Agent)
```

## Key Concepts

- **Mission**: Defines goal, agent blueprints, phases, and convergence policy
- **Phase**: `parallel` (independent work) | `interactive` (discussion threads) | `aggregate` (final stance)
- **TaskBoard**: REST API for task lifecycle (publish → claim → submit → verify)
- **InteractionThread**: Thread-level convergence — each post has independent discussion
- **InteractionRound**: Single round of interaction in a thread
- **AggregationDigest**: Aggregated result from multiple agents
- **ConvergencePolicy**: `mutualIntent` | `bothAgree` | `fixedRounds`

## API

### Programmatic

```typescript
import { SwarmFlow } from 'swarm-flow'

const swarm = new SwarmFlow({
  llm: { apiKey: 'sk-...', model: 'gpt-4o-mini' },
})

const missionId = await swarm.start(mission)
const result = await swarm.waitForCompletion(missionId)
await swarm.stop()
```

### REST API (TaskBoard Protocol)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/tasks/available?capabilities=x,y` | Fetch available tasks |
| POST | `/tasks/:id/claim` | Claim a task |
| POST | `/tasks/:id/submit` | Submit result |
| POST | `/tasks/:id/heartbeat` | Extend claim |
| POST | `/tasks/:id/abandon` | Release task |
| POST | `/missions` | Create mission |
| GET | `/missions/:id/progress` | Check progress |

## Testing

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # With coverage
```

## License

MIT
```

**Verification**:
- Demo script compiles without errors
- README contains all necessary documentation

---

### Task 14: Final Verification

**Steps**:
1. Run all tests: `npm test`
2. Verify TypeScript compiles: `npx tsc --noEmit`
3. Verify project structure: `find src tests examples -name '*.ts' | sort`

**Expected Results**:
- All tests pass (56 tests total)
- No TypeScript errors
- All files present in correct locations

---

## Summary

| Task | Component | Tests | Estimated Time |
|------|-----------|-------|---------------|
| 1 | Project scaffolding | — | 5 min |
| 2 | Type definitions | — | 10 min |
| 3 | Storage interface + MemoryStorage | 10 | 15 min |
| 4 | Convergence strategies | 11 | 10 min |
| 5 | Schema validator | 6 | 10 min |
| 6 | AggregationDigest | 5 | 15 min |
| 7 | TaskBoard state machine | 9 | 20 min |
| 8 | DAG Engine | 5 | 30 min |
| 9 | Worker Pool + MastraExecutor | 3 | 20 min |
| 10 | HTTP server (Fastify) | 5 | 25 min |
| 11 | SwarmFlow main class + index.ts | — | 10 min |
| 12 | Integration test (full lifecycle) | 2 | 15 min |
| 13 | CLI demo + README | — | 10 min |
| 14 | Final verification | — | 5 min |
| **Total** | | **56 tests** | **~3.5 hours** |

---

*Plan complete. Ready for execution.*
