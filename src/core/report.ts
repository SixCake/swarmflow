// Report Generator — layered report generation strategy
// Layer 1: Statistical summary (no LLM)
// Layer 2: Key insights extraction (no LLM)
// Layer 3: Conflict analysis (no LLM)
// Layer 4: Guidance signal summary (template-based)
// Layer 5: Final report (template-based)

import type { AggregationDigest, ClusterInsight, ConflictReport, GuidanceSuggestion } from './digest.js'

export interface MissionReport {
  /** Report title */
  title: string
  /** Executive summary */
  summary: string
  /** Layer 1: Statistical overview */
  statistics: StatisticsSection
  /** Layer 2: Key insights from clustering */
  insights: InsightsSection
  /** Layer 3: Conflict analysis */
  conflictAnalysis: ConflictSection
  /** Layer 4: Guidance recommendations */
  guidance: GuidanceSection
  /** Generated timestamp */
  generatedAt: Date
}

export interface StatisticsSection {
  totalAgents: number
  averageConfidence: number
  convergenceRate: number
  stanceBreakdown: { negative: number; neutral: number; positive: number }
}

export interface InsightsSection {
  clusterCount: number
  clusters: Array<{
    id: number
    size: number
    averageStance: number
    representative: string
    tags: string[]
  }>
}

export interface ConflictSection {
  conflictCount: number
  conflicts: Array<{
    description: string
    divergenceStrength: number
    sideASummary: string
    sideBSummary: string
  }>
}

export interface GuidanceSection {
  suggestions: Array<{
    type: string
    message: string
  }>
}

/**
 * Generate a structured mission report from an AggregationDigest.
 * All layers are deterministic (no LLM calls).
 */
export function generateReport(digest: AggregationDigest, missionGoal = 'Mission'): MissionReport {
  const statistics = buildStatisticsSection(digest)
  const insights = buildInsightsSection(digest.keyInsights)
  const conflictAnalysis = buildConflictSection(digest.conflicts)
  const guidance = buildGuidanceSection(digest.guidanceSuggestions)
  const summary = buildSummary(missionGoal, statistics, insights, conflictAnalysis)

  return {
    title: `Report: ${missionGoal}`,
    summary,
    statistics,
    insights,
    conflictAnalysis,
    guidance,
    generatedAt: new Date(),
  }
}

/**
 * Render a MissionReport to a human-readable Markdown string.
 */
export function renderReportMarkdown(report: MissionReport): string {
  const lines: string[] = []

  lines.push(`# ${report.title}`)
  lines.push('')
  lines.push(`> ${report.summary}`)
  lines.push('')

  // Statistics
  lines.push('## Statistics')
  lines.push(`- **Total agents**: ${report.statistics.totalAgents}`)
  lines.push(`- **Average confidence**: ${(report.statistics.averageConfidence * 100).toFixed(1)}%`)
  lines.push(`- **Convergence rate**: ${(report.statistics.convergenceRate * 100).toFixed(1)}%`)
  lines.push(`- **Stance breakdown**: ${report.statistics.stanceBreakdown.positive} positive, ${report.statistics.stanceBreakdown.neutral} neutral, ${report.statistics.stanceBreakdown.negative} negative`)
  lines.push('')

  // Insights
  if (report.insights.clusterCount > 0) {
    lines.push('## Key Insights')
    lines.push(`${report.insights.clusterCount} viewpoint cluster(s) identified:`)
    lines.push('')
    for (const cluster of report.insights.clusters) {
      lines.push(`### Cluster ${cluster.id} (${cluster.size} agent${cluster.size > 1 ? 's' : ''})`)
      lines.push(`- **Average stance**: ${cluster.averageStance.toFixed(2)}`)
      lines.push(`- **Representative view**: ${cluster.representative}`)
      if (cluster.tags.length > 0) {
        lines.push(`- **Tags**: ${cluster.tags.join(', ')}`)
      }
      lines.push('')
    }
  }

  // Conflicts
  if (report.conflictAnalysis.conflictCount > 0) {
    lines.push('## Conflicts')
    for (const conflict of report.conflictAnalysis.conflicts) {
      lines.push(`### ${conflict.description}`)
      lines.push(`- **Divergence**: ${(conflict.divergenceStrength * 100).toFixed(0)}%`)
      if (conflict.sideASummary) lines.push(`- **Side A**: ${conflict.sideASummary}`)
      if (conflict.sideBSummary) lines.push(`- **Side B**: ${conflict.sideBSummary}`)
      lines.push('')
    }
  }

  // Guidance
  if (report.guidance.suggestions.length > 0) {
    lines.push('## Recommendations')
    for (const s of report.guidance.suggestions) {
      lines.push(`- **[${s.type}]** ${s.message}`)
    }
    lines.push('')
  }

  lines.push(`---`)
  lines.push(`*Generated at ${report.generatedAt.toISOString()}*`)

  return lines.join('\n')
}

// ─── Internal builders ──────────────────────────────────────

function buildStatisticsSection(digest: AggregationDigest): StatisticsSection {
  let negative = 0
  let neutral = 0
  let positive = 0

  for (const [stance, count] of digest.stanceDistribution) {
    if (stance < -0.33) negative += count
    else if (stance > 0.33) positive += count
    else neutral += count
  }

  return {
    totalAgents: digest.totalResults,
    averageConfidence: digest.averageConfidence,
    convergenceRate: digest.convergenceRate,
    stanceBreakdown: { negative, neutral, positive },
  }
}

function buildInsightsSection(insights: ClusterInsight[]): InsightsSection {
  return {
    clusterCount: insights.length,
    clusters: insights.map(i => ({
      id: i.clusterId,
      size: i.size,
      averageStance: i.averageStance,
      representative: i.representative,
      tags: i.tags,
    })),
  }
}

function buildConflictSection(conflicts: ConflictReport[]): ConflictSection {
  return {
    conflictCount: conflicts.length,
    conflicts: conflicts.map(c => ({
      description: c.description,
      divergenceStrength: c.divergenceStrength,
      sideASummary: c.sideA.length > 0 ? c.sideA.join('; ') : 'No specific arguments',
      sideBSummary: c.sideB.length > 0 ? c.sideB.join('; ') : 'No specific arguments',
    })),
  }
}

function buildGuidanceSection(suggestions: GuidanceSuggestion[]): GuidanceSection {
  return {
    suggestions: suggestions.map(s => ({
      type: s.type,
      message: s.message,
    })),
  }
}

function buildSummary(
  goal: string,
  stats: StatisticsSection,
  insights: InsightsSection,
  conflicts: ConflictSection
): string {
  const parts: string[] = []

  parts.push(`Analysis of "${goal}" with ${stats.totalAgents} agent responses.`)

  if (stats.convergenceRate >= 0.8) {
    parts.push('Strong convergence achieved.')
  } else if (stats.convergenceRate >= 0.5) {
    parts.push('Moderate convergence.')
  } else {
    parts.push('Low convergence — significant disagreement remains.')
  }

  if (insights.clusterCount > 1) {
    parts.push(`${insights.clusterCount} distinct viewpoint clusters identified.`)
  }

  if (conflicts.conflictCount > 0) {
    parts.push(`${conflicts.conflictCount} conflict(s) detected.`)
  }

  return parts.join(' ')
}
