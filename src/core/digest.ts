// AggregationDigest — deterministic aggregation engine
// Zero-token digest: pure computation, no LLM calls

import type { TaskResult } from '../types/result.types.js'

export interface AggregationDigest {
  totalResults: number
  averageConfidence: number
  stanceDistribution: Map<number, number>
  keyArgumentsSummary: string[]
  convergenceRate: number
}

export function buildDigest(results: TaskResult[]): AggregationDigest {
  const totalResults = results.length
  const averageConfidence =
    totalResults > 0
      ? results.reduce((sum, r) => sum + r.metadata.confidence, 0) / totalResults
      : 0

  const stanceDistribution = new Map<number, number>()
  for (const result of results) {
    const stance = result.output.stance ?? 0
    stanceDistribution.set(stance, (stanceDistribution.get(stance) ?? 0) + 1)
  }

  const keyArgumentsSummary = results
    .flatMap(r => r.output.keyArguments ?? [])
    .map(arg => arg.point)

  const convergenceRate =
    totalResults > 0
      ? results.filter(r => !r.metadata.wantsContinue).length / totalResults
      : 0

  return {
    totalResults,
    averageConfidence,
    stanceDistribution,
    keyArgumentsSummary,
    convergenceRate,
  }
}
