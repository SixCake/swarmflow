// AggregationDigest — deterministic aggregation engine
// Zero-token digest: pure computation, no LLM calls
// Includes stance clustering, conflict analysis, and key insights extraction

import type { TaskResult, KeyArgument } from '../types/result.types.js'

// ─── Types ──────────────────────────────────────────────────

export interface AggregationDigest {
  totalResults: number
  averageConfidence: number
  stanceDistribution: Map<number, number>
  keyArgumentsSummary: string[]
  convergenceRate: number
  /** Clustered key insights (representative viewpoints per cluster) */
  keyInsights: ClusterInsight[]
  /** Detected conflicts between opposing stances */
  conflicts: ConflictReport[]
  /** Guidance suggestions for next round */
  guidanceSuggestions: GuidanceSuggestion[]
}

export interface ClusterInsight {
  clusterId: number
  /** Representative analysis text from the centroid result */
  representative: string
  /** Average stance of the cluster */
  averageStance: number
  /** Average confidence of the cluster */
  averageConfidence: number
  /** Number of results in this cluster */
  size: number
  /** Tags aggregated from all results in the cluster */
  tags: string[]
}

export interface ConflictReport {
  /** Description of the conflict */
  description: string
  /** Cluster IDs involved */
  clusterIds: [number, number]
  /** Divergence strength (0-1) */
  divergenceStrength: number
  /** Key arguments from each side */
  sideA: string[]
  sideB: string[]
}

export interface GuidanceSuggestion {
  type: 'devil_advocate' | 'focus_topic' | 'clarify' | 'deepen'
  message: string
  targetClusterId?: number
}

// ─── Main buildDigest ───────────────────────────────────────

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

  // Advanced: clustering, conflicts, guidance
  const keyInsights = totalResults >= 2 ? clusterResults(results) : []
  const conflicts = keyInsights.length >= 2 ? analyzeConflicts(keyInsights, results) : []
  const guidanceSuggestions = generateGuidanceSuggestions(keyInsights, conflicts, convergenceRate)

  return {
    totalResults,
    averageConfidence,
    stanceDistribution,
    keyArgumentsSummary,
    convergenceRate,
    keyInsights,
    conflicts,
    guidanceSuggestions,
  }
}

// ─── Stance Clustering ──────────────────────────────────────

/**
 * Compute Jaccard similarity between two results based on their tags.
 * Falls back to stance-based similarity if no tags available.
 */
export function computeJaccardSimilarity(a: TaskResult, b: TaskResult): number {
  const tagsA = new Set(a.output.tags ?? [])
  const tagsB = new Set(b.output.tags ?? [])

  // If both have tags, use Jaccard
  if (tagsA.size > 0 && tagsB.size > 0) {
    const intersection = new Set([...tagsA].filter(t => tagsB.has(t)))
    const union = new Set([...tagsA, ...tagsB])
    return union.size > 0 ? intersection.size / union.size : 0
  }

  // Fallback: stance-based similarity (1 - normalized distance)
  const stanceA = a.output.stance ?? 0
  const stanceB = b.output.stance ?? 0
  return 1 - Math.abs(stanceA - stanceB) / 2 // stance range is [-1, 1], max distance = 2
}

/**
 * Compute NxN similarity matrix for all results.
 */
export function computeSimilarityMatrix(results: TaskResult[]): number[][] {
  const n = results.length
  const matrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0))

  for (let i = 0; i < n; i++) {
    matrix[i][i] = 1
    for (let j = i + 1; j < n; j++) {
      const sim = computeJaccardSimilarity(results[i], results[j])
      matrix[i][j] = sim
      matrix[j][i] = sim
    }
  }

  return matrix
}

/**
 * Single-linkage hierarchical clustering.
 * Returns cluster assignments (array of cluster IDs, one per result).
 * Merges clusters until inter-cluster similarity drops below threshold.
 */
export function hierarchicalClustering(
  similarityMatrix: number[][],
  threshold = 0.3
): number[] {
  const n = similarityMatrix.length
  if (n === 0) return []
  if (n === 1) return [0]

  // Initialize: each result is its own cluster
  const clusters: Set<number>[] = Array.from({ length: n }, (_, i) => new Set([i]))
  const active = new Set(Array.from({ length: n }, (_, i) => i))

  while (active.size > 1) {
    // Find the two most similar clusters (single-linkage: max similarity between any pair)
    let bestSim = -1
    let bestI = -1
    let bestJ = -1

    const activeArr = [...active]
    for (let ai = 0; ai < activeArr.length; ai++) {
      for (let aj = ai + 1; aj < activeArr.length; aj++) {
        const ci = activeArr[ai]
        const cj = activeArr[aj]
        const sim = maxInterClusterSimilarity(clusters[ci], clusters[cj], similarityMatrix)
        if (sim > bestSim) {
          bestSim = sim
          bestI = ci
          bestJ = cj
        }
      }
    }

    // Stop if best similarity is below threshold
    if (bestSim < threshold) break

    // Merge bestJ into bestI
    for (const idx of clusters[bestJ]) {
      clusters[bestI].add(idx)
    }
    active.delete(bestJ)
  }

  // Build assignment array
  const assignments = new Array<number>(n).fill(0)
  let clusterId = 0
  for (const ci of active) {
    for (const idx of clusters[ci]) {
      assignments[idx] = clusterId
    }
    clusterId++
  }

  return assignments
}

function maxInterClusterSimilarity(
  a: Set<number>,
  b: Set<number>,
  matrix: number[][]
): number {
  let maxSim = -1
  for (const i of a) {
    for (const j of b) {
      if (matrix[i][j] > maxSim) maxSim = matrix[i][j]
    }
  }
  return maxSim
}

/**
 * Cluster results and extract key insights per cluster.
 */
function clusterResults(results: TaskResult[]): ClusterInsight[] {
  const matrix = computeSimilarityMatrix(results)
  const assignments = hierarchicalClustering(matrix)

  // Group results by cluster
  const clusterMap = new Map<number, number[]>()
  for (let i = 0; i < assignments.length; i++) {
    const cid = assignments[i]
    const existing = clusterMap.get(cid) ?? []
    existing.push(i)
    clusterMap.set(cid, existing)
  }

  // Build insights
  const insights: ClusterInsight[] = []
  for (const [clusterId, indices] of clusterMap) {
    const clusterResults = indices.map(i => results[i])
    const centroid = selectRepresentative(clusterResults)
    const avgStance = clusterResults.reduce((s, r) => s + (r.output.stance ?? 0), 0) / clusterResults.length
    const avgConf = clusterResults.reduce((s, r) => s + r.metadata.confidence, 0) / clusterResults.length
    const allTags = [...new Set(clusterResults.flatMap(r => r.output.tags ?? []))]

    insights.push({
      clusterId,
      representative: centroid.output.freeformAnalysis,
      averageStance: avgStance,
      averageConfidence: avgConf,
      size: clusterResults.length,
      tags: allTags,
    })
  }

  return insights.sort((a, b) => b.size - a.size)
}

/**
 * Select the most representative result (highest confidence) as centroid.
 */
export function selectRepresentative(results: TaskResult[]): TaskResult {
  return results.reduce((best, r) =>
    r.metadata.confidence > best.metadata.confidence ? r : best
  )
}

/**
 * Compute average confidence for a set of results.
 */
export function averageConfidence(results: TaskResult[]): number {
  if (results.length === 0) return 0
  return results.reduce((sum, r) => sum + r.metadata.confidence, 0) / results.length
}

// ─── Conflict Analysis ──────────────────────────────────────

/**
 * Detect conflicts between clusters with opposing stances.
 */
export function analyzeConflicts(
  insights: ClusterInsight[],
  results: TaskResult[]
): ConflictReport[] {
  const conflicts: ConflictReport[] = []

  for (let i = 0; i < insights.length; i++) {
    for (let j = i + 1; j < insights.length; j++) {
      const a = insights[i]
      const b = insights[j]

      // Check if stances are opposing (one positive, one negative)
      const stanceDiff = Math.abs(a.averageStance - b.averageStance)
      if (stanceDiff < 0.5) continue // Not enough divergence

      const divergenceStrength = Math.min(stanceDiff / 2, 1) // Normalize to [0, 1]

      // Extract key arguments from each side
      const sideAArgs = extractKeyPoints(results, insights, a.clusterId)
      const sideBArgs = extractKeyPoints(results, insights, b.clusterId)

      conflicts.push({
        description: `Conflict between cluster ${a.clusterId} (stance: ${a.averageStance.toFixed(2)}) and cluster ${b.clusterId} (stance: ${b.averageStance.toFixed(2)})`,
        clusterIds: [a.clusterId, b.clusterId],
        divergenceStrength,
        sideA: sideAArgs,
        sideB: sideBArgs,
      })
    }
  }

  return conflicts.sort((a, b) => b.divergenceStrength - a.divergenceStrength)
}

function extractKeyPoints(
  results: TaskResult[],
  insights: ClusterInsight[],
  clusterId: number
): string[] {
  // Find results belonging to this cluster by matching representative text
  const insight = insights.find(i => i.clusterId === clusterId)
  if (!insight) return []

  const clusterResults = results.filter(r =>
    r.output.freeformAnalysis === insight.representative ||
    (r.output.tags ?? []).some(t => insight.tags.includes(t))
  )

  return clusterResults
    .flatMap(r => r.output.keyArguments ?? [])
    .map((arg: KeyArgument) => arg.point)
    .slice(0, 5) // Limit to top 5
}

// ─── Guidance Suggestions ───────────────────────────────────

/**
 * Generate guidance suggestions based on digest analysis.
 */
export function generateGuidanceSuggestions(
  insights: ClusterInsight[],
  conflicts: ConflictReport[],
  convergenceRate: number
): GuidanceSuggestion[] {
  const suggestions: GuidanceSuggestion[] = []

  // If there's a dominant cluster, suggest devil's advocate
  if (insights.length > 0) {
    const dominant = insights[0]
    if (dominant.size > 1 && insights.length > 1) {
      const totalSize = insights.reduce((s, i) => s + i.size, 0)
      if (dominant.size / totalSize > 0.6) {
        suggestions.push({
          type: 'devil_advocate',
          message: `The dominant viewpoint (cluster ${dominant.clusterId}, ${dominant.size}/${totalSize} agents) may benefit from stronger counterarguments.`,
          targetClusterId: dominant.clusterId,
        })
      }
    }
  }

  // If there are strong conflicts, suggest focus
  for (const conflict of conflicts.slice(0, 2)) {
    if (conflict.divergenceStrength > 0.5) {
      suggestions.push({
        type: 'focus_topic',
        message: `Strong disagreement detected (divergence: ${(conflict.divergenceStrength * 100).toFixed(0)}%). Focus discussion on resolving the core conflict between clusters ${conflict.clusterIds[0]} and ${conflict.clusterIds[1]}.`,
      })
    }
  }

  // If convergence is low, suggest clarification
  if (convergenceRate < 0.3 && insights.length > 0) {
    suggestions.push({
      type: 'clarify',
      message: 'Low convergence rate. Agents may benefit from clearer problem framing or additional context.',
    })
  }

  // If convergence is high but there are still active discussions, suggest deepening
  if (convergenceRate > 0.7 && insights.length >= 2) {
    suggestions.push({
      type: 'deepen',
      message: 'High convergence achieved. Consider deepening analysis on remaining points of disagreement.',
    })
  }

  return suggestions
}
