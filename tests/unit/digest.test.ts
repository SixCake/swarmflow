import { describe, it, expect } from 'vitest'
import {
  buildDigest,
  computeJaccardSimilarity,
  computeSimilarityMatrix,
  hierarchicalClustering,
  selectRepresentative,
  averageConfidence,
  analyzeConflicts,
  generateGuidanceSuggestions,
} from '../../src/core/digest.js'
import { generateReport, renderReportMarkdown } from '../../src/core/report.js'
import type { TaskResult } from '../../src/types/result.types.js'
import type { ClusterInsight } from '../../src/core/digest.js'

function makeResult(opts: {
  analysis?: string
  stance?: number
  confidence?: number
  wantsContinue?: boolean
  tags?: string[]
  keyArguments?: Array<{ point: string; evidence: string; category: string }>
}): TaskResult {
  return {
    output: {
      freeformAnalysis: opts.analysis ?? 'test analysis',
      score: 0.8,
      stance: opts.stance ?? 0,
      tags: opts.tags,
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
    expect(digest.keyInsights).toHaveLength(0)
    expect(digest.conflicts).toHaveLength(0)
    expect(digest.guidanceSuggestions).toHaveLength(0)
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

  it('should produce keyInsights when >= 2 results', () => {
    const results = [
      makeResult({ stance: 0.8, analysis: 'Pro AI' }),
      makeResult({ stance: -0.8, analysis: 'Anti AI' }),
    ]
    const digest = buildDigest(results)
    expect(digest.keyInsights.length).toBeGreaterThanOrEqual(1)
  })

  it('should detect conflicts between opposing clusters', () => {
    const results = [
      makeResult({ stance: 0.9, analysis: 'Strongly pro' }),
      makeResult({ stance: 0.8, analysis: 'Pro' }),
      makeResult({ stance: -0.9, analysis: 'Strongly anti' }),
      makeResult({ stance: -0.8, analysis: 'Anti' }),
    ]
    const digest = buildDigest(results)
    expect(digest.conflicts.length).toBeGreaterThanOrEqual(1)
    expect(digest.conflicts[0].divergenceStrength).toBeGreaterThan(0.3)
  })
})

describe('computeJaccardSimilarity', () => {
  it('should return 1 for identical tag sets', () => {
    const a = makeResult({ tags: ['ai', 'safety'] })
    const b = makeResult({ tags: ['ai', 'safety'] })
    expect(computeJaccardSimilarity(a, b)).toBe(1)
  })

  it('should return 0 for disjoint tag sets', () => {
    const a = makeResult({ tags: ['ai'] })
    const b = makeResult({ tags: ['finance'] })
    expect(computeJaccardSimilarity(a, b)).toBe(0)
  })

  it('should return 0.5 for 50% overlap', () => {
    const a = makeResult({ tags: ['ai', 'safety'] })
    const b = makeResult({ tags: ['ai', 'ethics'] })
    // intersection = {ai}, union = {ai, safety, ethics} → 1/3
    expect(computeJaccardSimilarity(a, b)).toBeCloseTo(1 / 3)
  })

  it('should fall back to stance-based similarity when no tags', () => {
    const a = makeResult({ stance: 0.5 })
    const b = makeResult({ stance: 0.5 })
    expect(computeJaccardSimilarity(a, b)).toBe(1)
  })

  it('should return low similarity for opposing stances (no tags)', () => {
    const a = makeResult({ stance: 1 })
    const b = makeResult({ stance: -1 })
    expect(computeJaccardSimilarity(a, b)).toBe(0)
  })
})

describe('computeSimilarityMatrix', () => {
  it('should return empty matrix for empty results', () => {
    expect(computeSimilarityMatrix([])).toEqual([])
  })

  it('should return 1x1 matrix for single result', () => {
    const matrix = computeSimilarityMatrix([makeResult({})])
    expect(matrix).toEqual([[1]])
  })

  it('should be symmetric', () => {
    const results = [
      makeResult({ stance: 0.8 }),
      makeResult({ stance: -0.8 }),
      makeResult({ stance: 0.0 }),
    ]
    const matrix = computeSimilarityMatrix(results)
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        expect(matrix[i][j]).toBe(matrix[j][i])
      }
    }
  })
})

describe('hierarchicalClustering', () => {
  it('should return empty for empty matrix', () => {
    expect(hierarchicalClustering([])).toEqual([])
  })

  it('should return single cluster for 1 element', () => {
    expect(hierarchicalClustering([[1]])).toEqual([0])
  })

  it('should cluster similar items together', () => {
    // 3 items: 0 and 1 are similar, 2 is different
    const matrix = [
      [1, 0.9, 0.1],
      [0.9, 1, 0.1],
      [0.1, 0.1, 1],
    ]
    const assignments = hierarchicalClustering(matrix, 0.3)
    // 0 and 1 should be in the same cluster, 2 in a different one
    expect(assignments[0]).toBe(assignments[1])
    expect(assignments[0]).not.toBe(assignments[2])
  })

  it('should put all items in one cluster with low threshold', () => {
    const matrix = [
      [1, 0.5, 0.5],
      [0.5, 1, 0.5],
      [0.5, 0.5, 1],
    ]
    const assignments = hierarchicalClustering(matrix, 0.1)
    expect(assignments[0]).toBe(assignments[1])
    expect(assignments[1]).toBe(assignments[2])
  })
})

describe('selectRepresentative', () => {
  it('should select the result with highest confidence', () => {
    const results = [
      makeResult({ confidence: 0.5, analysis: 'Low' }),
      makeResult({ confidence: 0.9, analysis: 'High' }),
      makeResult({ confidence: 0.7, analysis: 'Mid' }),
    ]
    const rep = selectRepresentative(results)
    expect(rep.output.freeformAnalysis).toBe('High')
  })
})

describe('averageConfidence', () => {
  it('should return 0 for empty array', () => {
    expect(averageConfidence([])).toBe(0)
  })

  it('should calculate average correctly', () => {
    const results = [
      makeResult({ confidence: 0.6 }),
      makeResult({ confidence: 0.8 }),
    ]
    expect(averageConfidence(results)).toBeCloseTo(0.7)
  })
})

describe('analyzeConflicts', () => {
  it('should detect conflicts between opposing clusters', () => {
    const insights: ClusterInsight[] = [
      { clusterId: 0, representative: 'Pro', averageStance: 0.8, averageConfidence: 0.9, size: 2, tags: [] },
      { clusterId: 1, representative: 'Anti', averageStance: -0.8, averageConfidence: 0.85, size: 2, tags: [] },
    ]
    const conflicts = analyzeConflicts(insights, [])
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].divergenceStrength).toBeGreaterThan(0.5)
    expect(conflicts[0].clusterIds).toEqual([0, 1])
  })

  it('should not detect conflicts for similar clusters', () => {
    const insights: ClusterInsight[] = [
      { clusterId: 0, representative: 'A', averageStance: 0.5, averageConfidence: 0.9, size: 2, tags: [] },
      { clusterId: 1, representative: 'B', averageStance: 0.6, averageConfidence: 0.85, size: 2, tags: [] },
    ]
    const conflicts = analyzeConflicts(insights, [])
    expect(conflicts).toHaveLength(0)
  })
})

describe('generateGuidanceSuggestions', () => {
  it('should suggest devil_advocate for dominant cluster', () => {
    const insights: ClusterInsight[] = [
      { clusterId: 0, representative: 'Dominant', averageStance: 0.8, averageConfidence: 0.9, size: 4, tags: [] },
      { clusterId: 1, representative: 'Minority', averageStance: -0.5, averageConfidence: 0.7, size: 1, tags: [] },
    ]
    const suggestions = generateGuidanceSuggestions(insights, [], 0.5)
    expect(suggestions.some(s => s.type === 'devil_advocate')).toBe(true)
  })

  it('should suggest clarify for low convergence', () => {
    const insights: ClusterInsight[] = [
      { clusterId: 0, representative: 'A', averageStance: 0.5, averageConfidence: 0.5, size: 2, tags: [] },
    ]
    const suggestions = generateGuidanceSuggestions(insights, [], 0.1)
    expect(suggestions.some(s => s.type === 'clarify')).toBe(true)
  })

  it('should suggest deepen for high convergence with multiple clusters', () => {
    const insights: ClusterInsight[] = [
      { clusterId: 0, representative: 'A', averageStance: 0.5, averageConfidence: 0.9, size: 3, tags: [] },
      { clusterId: 1, representative: 'B', averageStance: 0.3, averageConfidence: 0.8, size: 2, tags: [] },
    ]
    const suggestions = generateGuidanceSuggestions(insights, [], 0.8)
    expect(suggestions.some(s => s.type === 'deepen')).toBe(true)
  })
})

describe('generateReport', () => {
  it('should generate a complete report from digest', () => {
    const results = [
      makeResult({ stance: 0.8, analysis: 'Pro regulation', confidence: 0.9 }),
      makeResult({ stance: 0.7, analysis: 'Somewhat pro', confidence: 0.85 }),
      makeResult({ stance: -0.8, analysis: 'Anti regulation', confidence: 0.8 }),
    ]
    const digest = buildDigest(results)
    const report = generateReport(digest, 'AI Regulation Debate')

    expect(report.title).toContain('AI Regulation Debate')
    expect(report.summary).toBeDefined()
    expect(report.statistics.totalAgents).toBe(3)
    expect(report.statistics.averageConfidence).toBeGreaterThan(0)
    expect(report.generatedAt).toBeInstanceOf(Date)
  })

  it('should include cluster insights in report', () => {
    const results = [
      makeResult({ stance: 0.9, analysis: 'Pro' }),
      makeResult({ stance: -0.9, analysis: 'Anti' }),
    ]
    const digest = buildDigest(results)
    const report = generateReport(digest)

    expect(report.insights.clusterCount).toBeGreaterThanOrEqual(1)
  })
})

describe('renderReportMarkdown', () => {
  it('should render a valid markdown string', () => {
    const results = [
      makeResult({ stance: 0.8, analysis: 'Pro' }),
      makeResult({ stance: -0.8, analysis: 'Anti' }),
    ]
    const digest = buildDigest(results)
    const report = generateReport(digest, 'Test Mission')
    const md = renderReportMarkdown(report)

    expect(md).toContain('# Report: Test Mission')
    expect(md).toContain('## Statistics')
    expect(md).toContain('Total agents')
    expect(md).toContain('Generated at')
  })
})
