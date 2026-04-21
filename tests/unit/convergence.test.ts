import { describe, it, expect, beforeEach } from 'vitest'
import {
  mutualIntent, bothAgree, fixedRounds,
  mutualIntentPolicy, bothAgreePolicy, fixedRoundsPolicy,
  consensusPolicy, stabilityPolicy, hybridPolicy,
  registerConvergenceStrategy, getConvergenceStrategy, clearCustomStrategies,
  computeDominantStanceFraction, computeStanceChangeRate,
} from '../../src/core/convergence.js'
import type { InteractionThread } from '../../src/types/thread.types.js'
import type { TaskResult } from '../../src/types/result.types.js'

function makeResult(wantsContinue: boolean, stance = 0): TaskResult {
  return {
    output: {
      freeformAnalysis: 'test analysis',
      score: 0.8,
      stance,
    },
    metadata: {
      wantsContinue,
      confidence: 0.9,
      executionTimeMs: 100,
      agentFramework: 'mastra',
    },
  }
}

function makeThread(
  rounds: Array<{ results: TaskResult[] }>,
  status: 'active' | 'converged' = 'active'
): InteractionThread {
  return {
    id: 'thread-1',
    missionId: 'mission-1',
    postTaskId: 'task-1',
    postAuthor: { role: 'author', instructions: 'Write' },
    participants: [],
    rounds: rounds.map((r, i) => ({
      roundNumber: i + 1,
      tasks: [],
      results: r.results,
    })),
    status,
  }
}

describe('Convergence Strategies', () => {
  // --- mutualIntent ---
  describe('mutualIntent', () => {
    it('should continue if any agent wants to continue', () => {
      const thread = makeThread([
        { results: [makeResult(true), makeResult(false)] },
      ])
      expect(mutualIntent.shouldThreadContinue(thread)).toBe(true)
    })

    it('should stop if no agent wants to continue', () => {
      const thread = makeThread([
        { results: [makeResult(false), makeResult(false)] },
      ])
      expect(mutualIntent.shouldThreadContinue(thread)).toBe(false)
    })

    it('should stop if max rounds reached', () => {
      const thread = makeThread([
        { results: [makeResult(true)] },
        { results: [makeResult(true)] },
        { results: [makeResult(true)] },
      ])
      expect(mutualIntent.shouldThreadContinue(thread)).toBe(false)
    })

    it('should stop if no rounds exist', () => {
      const thread = makeThread([])
      expect(mutualIntent.shouldThreadContinue(thread)).toBe(false)
    })

    it('isPhaseComplete should return true when all threads converged', () => {
      const threads = [
        makeThread([], 'converged'),
        makeThread([], 'converged'),
      ]
      expect(mutualIntent.isPhaseComplete(threads)).toBe(true)
    })

    it('isPhaseComplete should return false when some threads active', () => {
      const threads = [
        makeThread([], 'converged'),
        makeThread([], 'active'),
      ]
      expect(mutualIntent.isPhaseComplete(threads)).toBe(false)
    })
  })

  // --- bothAgree ---
  describe('bothAgree', () => {
    it('should continue only if ALL agents want to continue', () => {
      const thread = makeThread([
        { results: [makeResult(true), makeResult(true)] },
      ])
      expect(bothAgree.shouldThreadContinue(thread)).toBe(true)
    })

    it('should stop if any agent does not want to continue', () => {
      const thread = makeThread([
        { results: [makeResult(true), makeResult(false)] },
      ])
      expect(bothAgree.shouldThreadContinue(thread)).toBe(false)
    })

    it('should stop if max rounds reached', () => {
      const thread = makeThread([
        { results: [makeResult(true)] },
        { results: [makeResult(true)] },
        { results: [makeResult(true)] },
      ])
      expect(bothAgree.shouldThreadContinue(thread)).toBe(false)
    })

    it('isPhaseComplete should return true when all threads converged', () => {
      const threads = [
        makeThread([], 'converged'),
        makeThread([], 'converged'),
      ]
      expect(bothAgree.isPhaseComplete(threads)).toBe(true)
    })
  })

  // --- fixedRounds ---
  describe('fixedRounds', () => {
    it('should continue if rounds < maxRounds', () => {
      const policy = fixedRounds(5)
      const thread = makeThread([
        { results: [makeResult(false)] },
        { results: [makeResult(false)] },
      ])
      expect(policy.shouldThreadContinue(thread)).toBe(true)
    })

    it('should stop if rounds >= maxRounds', () => {
      const policy = fixedRounds(2)
      const thread = makeThread([
        { results: [makeResult(true)] },
        { results: [makeResult(true)] },
      ])
      expect(policy.shouldThreadContinue(thread)).toBe(false)
    })

    it('should stop at exactly maxRounds', () => {
      const policy = fixedRounds(3)
      const thread = makeThread([
        { results: [] },
        { results: [] },
        { results: [] },
      ])
      expect(policy.shouldThreadContinue(thread)).toBe(false)
    })

    it('isPhaseComplete should return true when all threads converged', () => {
      const policy = fixedRounds(3)
      const threads = [
        makeThread([], 'converged'),
        makeThread([], 'converged'),
      ]
      expect(policy.isPhaseComplete(threads)).toBe(true)
    })
  })

  // --- configurable maxRounds ---
  describe('configurable maxRounds', () => {
    it('mutualIntentPolicy should respect custom maxRounds', () => {
      const policy = mutualIntentPolicy({ maxRounds: 5 })
      const thread = makeThread([
        { results: [makeResult(true)] },
        { results: [makeResult(true)] },
        { results: [makeResult(true)] },
        { results: [makeResult(true)] },
      ])
      // 4 rounds < 5 maxRounds, and wantsContinue is true → should continue
      expect(policy.shouldThreadContinue(thread)).toBe(true)
    })

    it('bothAgreePolicy should respect custom maxRounds', () => {
      const policy = bothAgreePolicy({ maxRounds: 1 })
      const thread = makeThread([
        { results: [makeResult(true)] },
      ])
      // 1 round >= 1 maxRounds → should stop
      expect(policy.shouldThreadContinue(thread)).toBe(false)
    })
  })

  // --- consensus ---
  describe('consensus', () => {
    it('should stop when dominant stance exceeds threshold', () => {
      // All agents agree (stance > 0.33 → positive bucket)
      const policy = consensusPolicy({ consensusThreshold: 0.7 })
      const thread = makeThread([
        { results: [makeResult(true, 0.8), makeResult(true, 0.9), makeResult(true, 0.7)] },
      ])
      // 3/3 = 1.0 > 0.7 → consensus reached → stop
      expect(policy.shouldThreadContinue(thread)).toBe(false)
    })

    it('should continue when no consensus', () => {
      // Agents disagree: 1 positive, 1 negative, 1 neutral
      const policy = consensusPolicy({ consensusThreshold: 0.7 })
      const thread = makeThread([
        { results: [makeResult(true, 0.8), makeResult(true, -0.8), makeResult(true, 0.0)] },
      ])
      // Max bucket = 1/3 = 0.33 < 0.7 → no consensus → continue
      expect(policy.shouldThreadContinue(thread)).toBe(true)
    })

    it('should stop at maxRounds even without consensus', () => {
      const policy = consensusPolicy({ maxRounds: 2, consensusThreshold: 0.99 })
      const thread = makeThread([
        { results: [makeResult(true, 0.8), makeResult(true, -0.8)] },
        { results: [makeResult(true, 0.8), makeResult(true, -0.8)] },
      ])
      expect(policy.shouldThreadContinue(thread)).toBe(false)
    })

    it('should handle edge case with single agent', () => {
      const policy = consensusPolicy({ consensusThreshold: 0.5 })
      const thread = makeThread([
        { results: [makeResult(true, 0.5)] },
      ])
      // 1/1 = 1.0 > 0.5 → consensus → stop
      expect(policy.shouldThreadContinue(thread)).toBe(false)
    })
  })

  // --- stability ---
  describe('stability', () => {
    it('should continue when not enough rounds for comparison', () => {
      const policy = stabilityPolicy({ stabilityWindow: 3 })
      const thread = makeThread([
        { results: [makeResult(true, 0.8)] },
        { results: [makeResult(true, 0.8)] },
      ])
      // Only 2 rounds, window is 3 → not enough data → continue
      expect(policy.shouldThreadContinue(thread)).toBe(true)
    })

    it('should stop when stance distribution is stable', () => {
      // Same distribution across rounds → change rate = 0
      const policy = stabilityPolicy({ stabilityWindow: 2, stabilityThreshold: 0.1 })
      const thread = makeThread([
        { results: [makeResult(true, 0.8), makeResult(true, -0.8)] },
        { results: [makeResult(true, 0.9), makeResult(true, -0.7)] },
      ])
      // Both rounds: 1 positive, 1 negative → same distribution → stable → stop
      expect(policy.shouldThreadContinue(thread)).toBe(false)
    })

    it('should continue when stance distribution is changing', () => {
      // Distribution shifts from all-positive to all-negative
      const policy = stabilityPolicy({ stabilityWindow: 2, stabilityThreshold: 0.05 })
      const thread = makeThread([
        { results: [makeResult(true, 0.8), makeResult(true, 0.9)] },
        { results: [makeResult(true, -0.8), makeResult(true, -0.9)] },
      ])
      // Round 1: 2 positive, 0 negative → Round 2: 0 positive, 2 negative → high change → continue
      expect(policy.shouldThreadContinue(thread)).toBe(true)
    })

    it('should stop at maxRounds even if unstable', () => {
      const policy = stabilityPolicy({ maxRounds: 2, stabilityThreshold: 0.001 })
      const thread = makeThread([
        { results: [makeResult(true, 0.8)] },
        { results: [makeResult(true, -0.8)] },
      ])
      expect(policy.shouldThreadContinue(thread)).toBe(false)
    })
  })

  // --- hybrid ---
  describe('hybrid', () => {
    it('should stop when consensus is reached (even if unstable)', () => {
      const policy = hybridPolicy({ consensusThreshold: 0.6, stabilityWindow: 3, stabilityThreshold: 0.01 })
      const thread = makeThread([
        { results: [makeResult(true, 0.8), makeResult(true, 0.9), makeResult(true, 0.7)] },
      ])
      // 3/3 positive = 1.0 > 0.6 → consensus → stop (only 1 round, can't check stability)
      expect(policy.shouldThreadContinue(thread)).toBe(false)
    })

    it('should stop when stable (even without consensus)', () => {
      const policy = hybridPolicy({ consensusThreshold: 0.99, stabilityWindow: 2, stabilityThreshold: 0.1 })
      const thread = makeThread([
        { results: [makeResult(true, 0.8), makeResult(true, -0.8)] },
        { results: [makeResult(true, 0.9), makeResult(true, -0.7)] },
      ])
      // No consensus (50/50), but stable distribution → stop
      expect(policy.shouldThreadContinue(thread)).toBe(false)
    })

    it('should continue when neither consensus nor stability', () => {
      // 4 agents: distribution shifts between rounds, no single bucket dominates
      const policy = hybridPolicy({ consensusThreshold: 0.9, stabilityWindow: 2, stabilityThreshold: 0.01 })
      const thread = makeThread([
        // Round 1: 3 positive, 1 negative → dominant = 3/4 = 0.75 < 0.9
        { results: [makeResult(true, 0.8), makeResult(true, 0.9), makeResult(true, 0.7), makeResult(true, -0.8)] },
        // Round 2: 1 positive, 3 negative → dominant = 3/4 = 0.75 < 0.9, distribution shifted
        { results: [makeResult(true, 0.8), makeResult(true, -0.9), makeResult(true, -0.7), makeResult(true, -0.8)] },
      ])
      // No consensus (0.75 < 0.9), not stable (distribution shifted significantly) → continue
      expect(policy.shouldThreadContinue(thread)).toBe(true)
    })
  })

  // --- Custom strategy registry ---
  describe('custom strategy registry', () => {
    beforeEach(() => {
      clearCustomStrategies()
    })

    it('should register and retrieve a custom strategy', () => {
      const custom = {
        shouldThreadContinue: () => false,
        isPhaseComplete: (threads: InteractionThread[]) => threads.every(t => t.status === 'converged'),
      }
      registerConvergenceStrategy('myCustom', custom)
      const retrieved = getConvergenceStrategy('myCustom')
      expect(retrieved).toBe(custom)
    })

    it('should prefer custom strategy over built-in', () => {
      const custom = {
        shouldThreadContinue: () => true, // always continue
        isPhaseComplete: () => false,
      }
      registerConvergenceStrategy('mutualIntent', custom)
      const retrieved = getConvergenceStrategy('mutualIntent')
      // Custom overrides built-in
      const thread = makeThread([{ results: [makeResult(false)] }])
      expect(retrieved.shouldThreadContinue(thread)).toBe(true)
    })

    it('should fall back to built-in when custom not found', () => {
      const policy = getConvergenceStrategy('consensus')
      expect(policy).toBeDefined()
      expect(policy.shouldThreadContinue).toBeDefined()
    })

    it('should fall back to mutualIntent for unknown names', () => {
      const policy = getConvergenceStrategy('unknownStrategy')
      expect(policy).toBeDefined()
    })

    it('clearCustomStrategies should remove all custom strategies', () => {
      registerConvergenceStrategy('test1', { shouldThreadContinue: () => true, isPhaseComplete: () => true })
      registerConvergenceStrategy('test2', { shouldThreadContinue: () => true, isPhaseComplete: () => true })
      clearCustomStrategies()
      // After clear, getConvergenceStrategy('test1') should fall back to default
      const policy = getConvergenceStrategy('test1')
      // Should be mutualIntent (default fallback), not the custom one
      const thread = makeThread([{ results: [makeResult(false)] }])
      expect(policy.shouldThreadContinue(thread)).toBe(false) // mutualIntent stops when no one wants to continue
    })
  })

  // --- Helper functions ---
  describe('computeDominantStanceFraction', () => {
    it('should return 1 when all stances are in same bucket', () => {
      const results = [makeResult(false, 0.8), makeResult(false, 0.9)]
      expect(computeDominantStanceFraction(results)).toBe(1)
    })

    it('should return 0.5 for evenly split stances', () => {
      const results = [makeResult(false, 0.8), makeResult(false, -0.8)]
      expect(computeDominantStanceFraction(results)).toBe(0.5)
    })

    it('should return 0 for empty results', () => {
      expect(computeDominantStanceFraction([])).toBe(0)
    })

    it('should classify stances into correct buckets', () => {
      // -0.5 → negative, 0.0 → neutral, 0.5 → positive
      const results = [makeResult(false, -0.5), makeResult(false, 0.0), makeResult(false, 0.5)]
      // Each bucket has 1/3 → dominant = 1/3
      expect(computeDominantStanceFraction(results)).toBeCloseTo(1 / 3)
    })
  })

  describe('computeStanceChangeRate', () => {
    it('should return 0 for identical distributions', () => {
      const thread = makeThread([
        { results: [makeResult(false, 0.8), makeResult(false, -0.8)] },
        { results: [makeResult(false, 0.9), makeResult(false, -0.7)] },
      ])
      expect(computeStanceChangeRate(thread, 2)).toBe(0)
    })

    it('should return high value for completely different distributions', () => {
      const thread = makeThread([
        { results: [makeResult(false, 0.8), makeResult(false, 0.9)] },
        { results: [makeResult(false, -0.8), makeResult(false, -0.9)] },
      ])
      const rate = computeStanceChangeRate(thread, 2)
      expect(rate).toBeGreaterThan(0.5)
    })

    it('should return 1 for single round', () => {
      const thread = makeThread([
        { results: [makeResult(false, 0.8)] },
      ])
      expect(computeStanceChangeRate(thread, 2)).toBe(1)
    })
  })
})
