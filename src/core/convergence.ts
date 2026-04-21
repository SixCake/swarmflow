// Convergence strategies
// Built-in strategies: mutualIntent, bothAgree, fixedRounds, consensus, stability, hybrid
// Supports custom strategy registration via ConvergenceRegistry

import type { ConvergencePolicy } from '../types/convergence.types.js'
import type { InteractionThread } from '../types/thread.types.js'
import type { TaskResult } from '../types/result.types.js'

// ─── Configuration ──────────────────────────────────────────

export interface ConvergenceConfig {
  /** Maximum rounds before forced convergence (default: 3) */
  maxRounds?: number
  /** Consensus threshold: fraction of agents that must share the dominant stance (default: 0.7) */
  consensusThreshold?: number
  /** Stability window: number of recent rounds to compare (default: 2) */
  stabilityWindow?: number
  /** Stability threshold: max allowed change rate in stance distribution (default: 0.1) */
  stabilityThreshold?: number
}

const DEFAULT_CONFIG: Required<ConvergenceConfig> = {
  maxRounds: 3,
  consensusThreshold: 0.7,
  stabilityWindow: 2,
  stabilityThreshold: 0.1,
}

// ─── Basic strategies ───────────────────────────────────────

/**
 * mutualIntent: Continue if ANY agent wants to continue.
 * Converge when all agents signal wantsContinue: false, or maxRounds reached.
 */
export function mutualIntentPolicy(config: ConvergenceConfig = {}): ConvergencePolicy {
  const maxRounds = config.maxRounds ?? DEFAULT_CONFIG.maxRounds
  return {
    shouldThreadContinue(thread: InteractionThread): boolean {
      const latestRound = thread.rounds[thread.rounds.length - 1]
      if (!latestRound || thread.rounds.length >= maxRounds) return false
      return latestRound.results.some(r => r.metadata.wantsContinue)
    },
    isPhaseComplete(threads: InteractionThread[]): boolean {
      return threads.every(t => t.status === 'converged')
    },
  }
}

/**
 * bothAgree: Continue only if ALL agents want to continue.
 * Converge when any agent signals wantsContinue: false, or maxRounds reached.
 */
export function bothAgreePolicy(config: ConvergenceConfig = {}): ConvergencePolicy {
  const maxRounds = config.maxRounds ?? DEFAULT_CONFIG.maxRounds
  return {
    shouldThreadContinue(thread: InteractionThread): boolean {
      const latestRound = thread.rounds[thread.rounds.length - 1]
      if (!latestRound || thread.rounds.length >= maxRounds) return false
      return latestRound.results.every(r => r.metadata.wantsContinue)
    },
    isPhaseComplete(threads: InteractionThread[]): boolean {
      return threads.every(t => t.status === 'converged')
    },
  }
}

/**
 * fixedRounds: Always continue until exactly N rounds are completed.
 */
export function fixedRoundsPolicy(maxRounds: number): ConvergencePolicy {
  return {
    shouldThreadContinue(thread: InteractionThread): boolean {
      return thread.rounds.length < maxRounds
    },
    isPhaseComplete(threads: InteractionThread[]): boolean {
      return threads.every(t => t.status === 'converged')
    },
  }
}

// ─── Advanced strategies ────────────────────────────────────

/**
 * consensus: Converge when the dominant stance exceeds a threshold.
 * Groups results by stance bucket (negative / neutral / positive) and checks
 * if the largest group's fraction exceeds consensusThreshold.
 */
export function consensusPolicy(config: ConvergenceConfig = {}): ConvergencePolicy {
  const maxRounds = config.maxRounds ?? DEFAULT_CONFIG.maxRounds
  const threshold = config.consensusThreshold ?? DEFAULT_CONFIG.consensusThreshold
  return {
    shouldThreadContinue(thread: InteractionThread): boolean {
      if (thread.rounds.length >= maxRounds) return false
      const latestRound = thread.rounds[thread.rounds.length - 1]
      if (!latestRound || latestRound.results.length === 0) return false

      const dominantFraction = computeDominantStanceFraction(latestRound.results)
      // If consensus reached, stop
      if (dominantFraction >= threshold) return false
      // Otherwise continue
      return true
    },
    isPhaseComplete(threads: InteractionThread[]): boolean {
      return threads.every(t => t.status === 'converged')
    },
  }
}

/**
 * stability: Converge when the stance distribution stops changing.
 * Compares the stance distribution of the last N rounds (stabilityWindow).
 * If the change rate is below stabilityThreshold, convergence is reached.
 */
export function stabilityPolicy(config: ConvergenceConfig = {}): ConvergencePolicy {
  const maxRounds = config.maxRounds ?? DEFAULT_CONFIG.maxRounds
  const window = config.stabilityWindow ?? DEFAULT_CONFIG.stabilityWindow
  const threshold = config.stabilityThreshold ?? DEFAULT_CONFIG.stabilityThreshold
  return {
    shouldThreadContinue(thread: InteractionThread): boolean {
      if (thread.rounds.length >= maxRounds) return false
      if (thread.rounds.length < window) return true // Not enough rounds to compare

      const changeRate = computeStanceChangeRate(thread, window)
      // If stable, stop
      if (changeRate <= threshold) return false
      return true
    },
    isPhaseComplete(threads: InteractionThread[]): boolean {
      return threads.every(t => t.status === 'converged')
    },
  }
}

/**
 * hybrid: Combines consensus + stability.
 * Converges when EITHER consensus is reached OR stance distribution is stable.
 */
export function hybridPolicy(config: ConvergenceConfig = {}): ConvergencePolicy {
  const maxRounds = config.maxRounds ?? DEFAULT_CONFIG.maxRounds
  const consensusThreshold = config.consensusThreshold ?? DEFAULT_CONFIG.consensusThreshold
  const stabilityWindow = config.stabilityWindow ?? DEFAULT_CONFIG.stabilityWindow
  const stabilityThreshold = config.stabilityThreshold ?? DEFAULT_CONFIG.stabilityThreshold
  return {
    shouldThreadContinue(thread: InteractionThread): boolean {
      if (thread.rounds.length >= maxRounds) return false
      const latestRound = thread.rounds[thread.rounds.length - 1]
      if (!latestRound || latestRound.results.length === 0) return false

      // Check consensus
      const dominantFraction = computeDominantStanceFraction(latestRound.results)
      if (dominantFraction >= consensusThreshold) return false

      // Check stability
      if (thread.rounds.length >= stabilityWindow) {
        const changeRate = computeStanceChangeRate(thread, stabilityWindow)
        if (changeRate <= stabilityThreshold) return false
      }

      return true
    },
    isPhaseComplete(threads: InteractionThread[]): boolean {
      return threads.every(t => t.status === 'converged')
    },
  }
}

// ─── Backward-compatible singletons (default config) ────────

export const mutualIntent: ConvergencePolicy = mutualIntentPolicy()
export const bothAgree: ConvergencePolicy = bothAgreePolicy()
export const fixedRounds = (maxRounds: number): ConvergencePolicy => fixedRoundsPolicy(maxRounds)

// ─── Custom strategy registry ───────────────────────────────

const customStrategies = new Map<string, ConvergencePolicy>()

/**
 * Register a custom convergence strategy by name.
 */
export function registerConvergenceStrategy(name: string, policy: ConvergencePolicy): void {
  customStrategies.set(name, policy)
}

/**
 * Get a convergence strategy by name. Checks custom registry first, then built-ins.
 */
export function getConvergenceStrategy(name: string, config: ConvergenceConfig = {}): ConvergencePolicy {
  // Check custom registry
  const custom = customStrategies.get(name)
  if (custom) return custom

  // Built-in strategies
  switch (name) {
    case 'mutualIntent': return mutualIntentPolicy(config)
    case 'bothAgree': return bothAgreePolicy(config)
    case 'fixedRounds': return fixedRoundsPolicy(config.maxRounds ?? DEFAULT_CONFIG.maxRounds)
    case 'consensus': return consensusPolicy(config)
    case 'stability': return stabilityPolicy(config)
    case 'hybrid': return hybridPolicy(config)
    default: return mutualIntentPolicy(config)
  }
}

/**
 * Clear all custom strategies (useful for testing).
 */
export function clearCustomStrategies(): void {
  customStrategies.clear()
}

// ─── Internal helpers ───────────────────────────────────────

/**
 * Compute the fraction of results that share the dominant stance bucket.
 * Stance buckets: negative (< -0.33), neutral (-0.33 to 0.33), positive (> 0.33)
 */
function computeDominantStanceFraction(results: TaskResult[]): number {
  if (results.length === 0) return 0

  const buckets = { negative: 0, neutral: 0, positive: 0 }
  for (const r of results) {
    const stance = r.output.stance ?? 0
    if (stance < -0.33) buckets.negative++
    else if (stance > 0.33) buckets.positive++
    else buckets.neutral++
  }

  const maxCount = Math.max(buckets.negative, buckets.neutral, buckets.positive)
  return maxCount / results.length
}

/**
 * Compute the change rate of stance distribution over the last N rounds.
 * Returns a value between 0 (no change) and 1 (maximum change).
 */
function computeStanceChangeRate(thread: InteractionThread, window: number): number {
  const rounds = thread.rounds.slice(-window)
  if (rounds.length < 2) return 1 // Not enough data, assume high change

  const distributions = rounds.map(round => {
    const buckets = { negative: 0, neutral: 0, positive: 0 }
    for (const r of round.results) {
      const stance = r.output.stance ?? 0
      if (stance < -0.33) buckets.negative++
      else if (stance > 0.33) buckets.positive++
      else buckets.neutral++
    }
    const total = round.results.length || 1
    return {
      negative: buckets.negative / total,
      neutral: buckets.neutral / total,
      positive: buckets.positive / total,
    }
  })

  // Compute average absolute change between consecutive distributions
  let totalChange = 0
  for (let i = 1; i < distributions.length; i++) {
    const prev = distributions[i - 1]
    const curr = distributions[i]
    totalChange += Math.abs(curr.negative - prev.negative)
    totalChange += Math.abs(curr.neutral - prev.neutral)
    totalChange += Math.abs(curr.positive - prev.positive)
  }

  // Normalize: max possible change per step is 2.0 (all mass shifts), divide by steps
  const steps = distributions.length - 1
  return totalChange / (steps * 2)
}

// Export helpers for testing
export { computeDominantStanceFraction, computeStanceChangeRate }
