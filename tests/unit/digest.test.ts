import { describe, it, expect } from 'vitest'
import { buildDigest } from '../../src/core/digest.js'
import type { TaskResult } from '../../src/types/result.types.js'

function makeResult(opts: {
  stance?: number
  confidence?: number
  wantsContinue?: boolean
  keyArguments?: Array<{ point: string; evidence: string; category: string }>
}): TaskResult {
  return {
    output: {
      freeformAnalysis: 'test analysis',
      score: 0.8,
      stance: opts.stance ?? 0,
      keyArguments: opts.keyArguments,
    },
    metadata: {
      wantsContinue: opts.wantsContinue ?? false,
      confidence: opts.confidence ?? 0.8,
      executionTimeMs: 100,
      agentFramework: 'mastra',
    },
  }
}

describe('buildDigest', () => {
  it('should handle empty results', () => {
    const digest = buildDigest([])
    expect(digest.totalResults).toBe(0)
    expect(digest.averageConfidence).toBe(0)
    expect(digest.stanceDistribution.size).toBe(0)
    expect(digest.keyArgumentsSummary).toHaveLength(0)
    expect(digest.convergenceRate).toBe(0)
  })

  it('should calculate totalResults correctly', () => {
    const results = [makeResult({}), makeResult({}), makeResult({})]
    const digest = buildDigest(results)
    expect(digest.totalResults).toBe(3)
  })

  it('should calculate averageConfidence correctly', () => {
    const results = [
      makeResult({ confidence: 0.6 }),
      makeResult({ confidence: 0.8 }),
      makeResult({ confidence: 1.0 }),
    ]
    const digest = buildDigest(results)
    expect(digest.averageConfidence).toBeCloseTo(0.8, 5)
  })

  it('should calculate stanceDistribution correctly', () => {
    const results = [
      makeResult({ stance: 1 }),
      makeResult({ stance: 1 }),
      makeResult({ stance: -1 }),
      makeResult({ stance: 0 }),
    ]
    const digest = buildDigest(results)
    expect(digest.stanceDistribution.get(1)).toBe(2)
    expect(digest.stanceDistribution.get(-1)).toBe(1)
    expect(digest.stanceDistribution.get(0)).toBe(1)
  })

  it('should default stance to 0 when undefined', () => {
    const results = [makeResult({ stance: undefined })]
    const digest = buildDigest(results)
    expect(digest.stanceDistribution.get(0)).toBe(1)
  })

  it('should extract keyArgumentsSummary from results', () => {
    const results = [
      makeResult({
        keyArguments: [
          { point: 'Point A', evidence: 'Evidence A', category: 'cat1' },
          { point: 'Point B', evidence: 'Evidence B', category: 'cat2' },
        ],
      }),
      makeResult({
        keyArguments: [
          { point: 'Point C', evidence: 'Evidence C', category: 'cat1' },
        ],
      }),
    ]
    const digest = buildDigest(results)
    expect(digest.keyArgumentsSummary).toEqual(['Point A', 'Point B', 'Point C'])
  })

  it('should handle results without keyArguments', () => {
    const results = [makeResult({})]
    const digest = buildDigest(results)
    expect(digest.keyArgumentsSummary).toHaveLength(0)
  })

  it('should calculate convergenceRate correctly', () => {
    const results = [
      makeResult({ wantsContinue: false }),
      makeResult({ wantsContinue: false }),
      makeResult({ wantsContinue: true }),
    ]
    const digest = buildDigest(results)
    // 2 out of 3 don't want to continue
    expect(digest.convergenceRate).toBeCloseTo(2 / 3, 5)
  })

  it('should return convergenceRate 1.0 when all converged', () => {
    const results = [
      makeResult({ wantsContinue: false }),
      makeResult({ wantsContinue: false }),
    ]
    const digest = buildDigest(results)
    expect(digest.convergenceRate).toBe(1)
  })

  it('should return convergenceRate 0 when none converged', () => {
    const results = [
      makeResult({ wantsContinue: true }),
      makeResult({ wantsContinue: true }),
    ]
    const digest = buildDigest(results)
    expect(digest.convergenceRate).toBe(0)
  })
})
