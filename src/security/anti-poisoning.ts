// Anti-Poisoning — cross-validation, anomaly detection, Sybil attack detection
// Protects against malicious agents attempting to manipulate consensus

import type { TaskResult } from '../types/result.types.js'

// ─── Types ──────────────────────────────────────────────────

export interface AnomalyReport {
  agentId: string
  taskId: string
  anomalyType: 'stance_outlier' | 'confidence_outlier' | 'rapid_flip' | 'sybil_suspect'
  severity: 'low' | 'medium' | 'high'
  description: string
  value: number
  threshold: number
}

export interface CrossValidationResult {
  isConsistent: boolean
  inconsistencies: Array<{
    agentId: string
    claim: string
    contradictedBy: string[]
  }>
}

export interface SybilDetectionResult {
  hasSuspects: boolean
  suspectGroups: Array<{
    agentIds: string[]
    similarity: number
    reason: string
  }>
}

// ─── Anomaly Detection ──────────────────────────────────────

/**
 * Detect stance outliers using IQR (Interquartile Range) method.
 */
export function detectStanceOutliers(
  results: Array<{ agentId: string; taskId: string; result: TaskResult }>,
  multiplier = 1.5
): AnomalyReport[] {
  if (results.length < 3) return []

  const stances = results.map(r => r.result.output.stance ?? 0).sort((a, b) => a - b)
  const q1 = stances[Math.floor(stances.length * 0.25)]
  const q3 = stances[Math.floor(stances.length * 0.75)]
  const iqr = q3 - q1
  const lowerBound = q1 - multiplier * iqr
  const upperBound = q3 + multiplier * iqr

  const anomalies: AnomalyReport[] = []
  for (const r of results) {
    const stance = r.result.output.stance ?? 0
    if (stance < lowerBound || stance > upperBound) {
      anomalies.push({
        agentId: r.agentId,
        taskId: r.taskId,
        anomalyType: 'stance_outlier',
        severity: Math.abs(stance) > 0.9 ? 'high' : 'medium',
        description: `Stance ${stance.toFixed(2)} is outside IQR bounds [${lowerBound.toFixed(2)}, ${upperBound.toFixed(2)}]`,
        value: stance,
        threshold: stance < lowerBound ? lowerBound : upperBound,
      })
    }
  }

  return anomalies
}

/**
 * Detect confidence outliers — agents with unusually high or low confidence.
 */
export function detectConfidenceOutliers(
  results: Array<{ agentId: string; taskId: string; result: TaskResult }>,
  multiplier = 1.5
): AnomalyReport[] {
  if (results.length < 3) return []

  const confidences = results.map(r => r.result.metadata.confidence).sort((a, b) => a - b)
  const q1 = confidences[Math.floor(confidences.length * 0.25)]
  const q3 = confidences[Math.floor(confidences.length * 0.75)]
  const iqr = q3 - q1
  const lowerBound = q1 - multiplier * iqr
  const upperBound = q3 + multiplier * iqr

  const anomalies: AnomalyReport[] = []
  for (const r of results) {
    const confidence = r.result.metadata.confidence
    if (confidence < lowerBound || confidence > upperBound) {
      anomalies.push({
        agentId: r.agentId,
        taskId: r.taskId,
        anomalyType: 'confidence_outlier',
        severity: 'medium',
        description: `Confidence ${confidence.toFixed(2)} is outside IQR bounds [${lowerBound.toFixed(2)}, ${upperBound.toFixed(2)}]`,
        value: confidence,
        threshold: confidence < lowerBound ? lowerBound : upperBound,
      })
    }
  }

  return anomalies
}

/**
 * Detect rapid stance flips — agents that dramatically change their stance between rounds.
 */
export function detectRapidFlips(
  history: Array<{ agentId: string; taskId: string; round: number; result: TaskResult }>,
  flipThreshold = 1.0
): AnomalyReport[] {
  const anomalies: AnomalyReport[] = []

  // Group by agentId
  const byAgent = new Map<string, typeof history>()
  for (const entry of history) {
    const existing = byAgent.get(entry.agentId) ?? []
    existing.push(entry)
    byAgent.set(entry.agentId, existing)
  }

  for (const [agentId, entries] of byAgent) {
    const sorted = entries.sort((a, b) => a.round - b.round)
    for (let i = 1; i < sorted.length; i++) {
      const prevStance = sorted[i - 1].result.output.stance ?? 0
      const currStance = sorted[i].result.output.stance ?? 0
      const flip = Math.abs(currStance - prevStance)

      if (flip >= flipThreshold) {
        anomalies.push({
          agentId,
          taskId: sorted[i].taskId,
          anomalyType: 'rapid_flip',
          severity: flip >= 1.5 ? 'high' : 'medium',
          description: `Stance flipped from ${prevStance.toFixed(2)} to ${currStance.toFixed(2)} (delta: ${flip.toFixed(2)}) between rounds ${sorted[i - 1].round} and ${sorted[i].round}`,
          value: flip,
          threshold: flipThreshold,
        })
      }
    }
  }

  return anomalies
}

// ─── Cross-Validation ───────────────────────────────────────

/**
 * Cross-validate results by checking if key arguments are supported by multiple agents.
 * Arguments claimed by only one agent and contradicted by others are flagged.
 */
export function crossValidateResults(
  results: Array<{ agentId: string; result: TaskResult }>
): CrossValidationResult {
  const inconsistencies: CrossValidationResult['inconsistencies'] = []

  // Extract all key arguments per agent
  const agentArguments = new Map<string, Set<string>>()
  for (const r of results) {
    const args = (r.result.output.keyArguments ?? []).map(a => a.point.toLowerCase())
    agentArguments.set(r.agentId, new Set(args))
  }

  // For each agent, check if their unique claims are contradicted
  for (const [agentId, args] of agentArguments) {
    for (const arg of args) {
      const supporters = [...agentArguments.entries()]
        .filter(([id, otherArgs]) => id !== agentId && otherArgs.has(arg))
        .map(([id]) => id)

      // If no one else supports this argument and there are opposing stances
      if (supporters.length === 0 && results.length > 2) {
        const agentResult = results.find(r => r.agentId === agentId)
        const agentStance = agentResult?.result.output.stance ?? 0
        const contradictors = results
          .filter(r => r.agentId !== agentId && Math.sign(r.result.output.stance ?? 0) !== Math.sign(agentStance))
          .map(r => r.agentId)

        if (contradictors.length > 0) {
          inconsistencies.push({
            agentId,
            claim: arg,
            contradictedBy: contradictors,
          })
        }
      }
    }
  }

  return {
    isConsistent: inconsistencies.length === 0,
    inconsistencies,
  }
}

// ─── Sybil Attack Detection ────────────────────────────────

/**
 * Detect potential Sybil attacks — multiple agents producing suspiciously similar outputs.
 * Uses text similarity on freeformAnalysis and stance/confidence matching.
 */
export function detectSybilAttacks(
  results: Array<{ agentId: string; result: TaskResult }>,
  similarityThreshold = 0.85
): SybilDetectionResult {
  const suspectGroups: SybilDetectionResult['suspectGroups'] = []

  for (let i = 0; i < results.length; i++) {
    for (let j = i + 1; j < results.length; j++) {
      const a = results[i]
      const b = results[j]

      const similarity = computeOutputSimilarity(a.result, b.result)
      if (similarity >= similarityThreshold) {
        // Check if this pair is already in a suspect group
        const existingGroup = suspectGroups.find(
          g => g.agentIds.includes(a.agentId) || g.agentIds.includes(b.agentId)
        )

        if (existingGroup) {
          if (!existingGroup.agentIds.includes(a.agentId)) existingGroup.agentIds.push(a.agentId)
          if (!existingGroup.agentIds.includes(b.agentId)) existingGroup.agentIds.push(b.agentId)
          existingGroup.similarity = Math.max(existingGroup.similarity, similarity)
        } else {
          suspectGroups.push({
            agentIds: [a.agentId, b.agentId],
            similarity,
            reason: `Output similarity ${(similarity * 100).toFixed(0)}% exceeds threshold ${(similarityThreshold * 100).toFixed(0)}%`,
          })
        }
      }
    }
  }

  return {
    hasSuspects: suspectGroups.length > 0,
    suspectGroups,
  }
}

/**
 * Compute similarity between two task results.
 * Combines text similarity, stance similarity, and confidence similarity.
 */
function computeOutputSimilarity(a: TaskResult, b: TaskResult): number {
  const textSim = computeTextSimilarity(
    a.output.freeformAnalysis,
    b.output.freeformAnalysis
  )
  const stanceSim = 1 - Math.abs((a.output.stance ?? 0) - (b.output.stance ?? 0)) / 2
  const confSim = 1 - Math.abs(a.metadata.confidence - b.metadata.confidence)

  // Weighted average: text similarity is most important
  return textSim * 0.6 + stanceSim * 0.2 + confSim * 0.2
}

/**
 * Simple bigram-based text similarity (Dice coefficient).
 */
function computeTextSimilarity(a: string, b: string): number {
  if (a === b) return 1
  if (a.length < 2 || b.length < 2) return 0

  const bigramsA = new Set<string>()
  const bigramsB = new Set<string>()

  for (let i = 0; i < a.length - 1; i++) bigramsA.add(a.slice(i, i + 2).toLowerCase())
  for (let i = 0; i < b.length - 1; i++) bigramsB.add(b.slice(i, i + 2).toLowerCase())

  let intersection = 0
  for (const bg of bigramsA) {
    if (bigramsB.has(bg)) intersection++
  }

  return (2 * intersection) / (bigramsA.size + bigramsB.size)
}
