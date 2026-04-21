import { describe, it, expect } from 'vitest'
import { mutualIntent, bothAgree, fixedRounds } from '../../src/core/convergence.js'
import type { InteractionThread } from '../../src/types/thread.types.js'
import type { TaskResult } from '../../src/types/result.types.js'

function makeResult(wantsContinue: boolean): TaskResult {
  return {
    output: {
      freeformAnalysis: 'test analysis',
      score: 0.8,
      stance: 0,
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
})
