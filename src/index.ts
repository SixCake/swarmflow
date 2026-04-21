// Public API exports for SwarmFlow

export * from './types/index.js'
export { SwarmFlow } from './swarm-flow.js'
export type { SwarmFlowConfig } from './swarm-flow.js'
export { MissionManager } from './core/mission-manager.js'
export type { MissionRecord } from './core/mission-manager.js'
export { TaskBoard } from './core/task-board.js'
export { DAGEngine } from './core/dag-engine.js'
export { SchemaValidator } from './core/schema-validator.js'
export { buildDigest } from './core/digest.js'
export type { AggregationDigest } from './core/digest.js'
export {
  mutualIntent, bothAgree, fixedRounds,
  mutualIntentPolicy, bothAgreePolicy, fixedRoundsPolicy,
  consensusPolicy, stabilityPolicy, hybridPolicy,
  registerConvergenceStrategy, getConvergenceStrategy, clearCustomStrategies,
} from './core/convergence.js'
export type { ConvergenceConfig } from './core/convergence.js'
export { MemoryStorage } from './storage/memory-storage.js'
export type { StorageProvider, MissionRecord as StorageMissionRecord } from './storage/storage.interface.js'
export { WorkerPool } from './worker/worker-pool.js'
export { MastraExecutor } from './worker/mastra-executor.js'
