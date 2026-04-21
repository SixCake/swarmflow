#!/usr/bin/env npx tsx
/**
 * SwarmFlow Product Evaluation — Multi-Dimensional Assessment Space (via REST API)
 *
 * Demonstrates a 5-agent product evaluation workflow through HTTP REST API where
 * specialized evaluators assess a product from different dimensions, discuss
 * trade-offs, and produce a unified evaluation report.
 *
 * Usage: npx tsx examples/product-evaluation/index.ts
 */

import { startServer } from '../shared/server-helper.js'
import { SwarmFlowClient } from '../shared/api-client.js'
import { MastraExecutor } from '../../src/worker/mastra-executor.js'
import { buildDigest } from '../../src/core/digest.js'
import { fixedRounds } from '../../src/core/convergence.js'
import type { Mission } from '../../src/types/mission.types.js'
import type { Task } from '../../src/types/task.types.js'
import type { TaskResult } from '../../src/types/result.types.js'
import type { InteractionThread } from '../../src/types/thread.types.js'

// ─── Helper: create a task object ────────────────────────────

function buildTask(
  id: string,
  mission: Mission,
  phaseId: string,
  blueprintIndex: number,
  instructions: string,
  extra?: { threadId?: string; type?: string },
): Task {
  return {
    id,
    missionId: mission.id,
    phaseId,
    threadId: extra?.threadId,
    type: extra?.type ?? mission.phases.find(p => p.id === phaseId)!.taskTemplate.type,
    blueprint: mission.blueprints[blueprintIndex],
    instructions,
    context: mission.context,
    expectedOutputSchema: {},
    status: 'published' as const,
    retryCount: 0,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 15 * 60_000),
  }
}

// ─── Helper: execute a task through full REST API lifecycle ──

async function executeTaskViaAPI(
  client: SwarmFlowClient,
  executor: MastraExecutor,
  task: Task,
): Promise<TaskResult> {
  await client.publishTask(task)
  await client.claimTask(task.id, `worker-${task.blueprint.role}`)
  const result = await executor.execute(task)
  await client.submitTask(task.id, result)
  await client.verifyTask(task.id)
  return result
}

// ─── Product Under Evaluation ────────────────────────────────

const PRODUCT = {
  name: 'CloudSync Pro',
  version: '2.1.0',
  category: 'SaaS — Enterprise File Synchronization',
  description:
    'CloudSync Pro is an enterprise file synchronization and sharing platform ' +
    'that provides real-time collaboration, end-to-end encryption, and ' +
    'compliance-ready audit trails for regulated industries.',
  features: [
    'Real-time file sync across unlimited devices',
    'End-to-end AES-256 encryption at rest and in transit',
    'Granular role-based access control (RBAC)',
    'Compliance audit trail with 7-year retention',
    'API-first architecture with REST and GraphQL endpoints',
    'Offline mode with conflict resolution',
    'SSO integration (SAML 2.0, OIDC)',
    'Custom branding and white-label options',
  ],
  pricing: {
    starter: '$12/user/month (up to 50 users)',
    business: '$25/user/month (up to 500 users)',
    enterprise: 'Custom pricing (unlimited users)',
  },
  competitors: ['Dropbox Business', 'Box Enterprise', 'SharePoint', 'Egnyte'],
  targetMarket: 'Mid-to-large enterprises in healthcare, finance, and legal sectors',
}

// ─── Evaluation Dimensions & Weights ─────────────────────────

const DIMENSIONS = [
  { role: 'ux-evaluator', dimension: 'User Experience', weight: 0.20 },
  { role: 'technical-evaluator', dimension: 'Technical Quality', weight: 0.25 },
  { role: 'business-evaluator', dimension: 'Business Viability', weight: 0.25 },
  { role: 'compliance-evaluator', dimension: 'Compliance & Security', weight: 0.20 },
  { role: 'innovation-evaluator', dimension: 'Innovation & Differentiation', weight: 0.10 },
]

// ─── Mission Definition ──────────────────────────────────────

const MISSION: Mission = {
  id: 'product-eval-cloudsync-001',
  goal: `Comprehensive evaluation of ${PRODUCT.name} v${PRODUCT.version}`,
  context: {
    product: PRODUCT,
    dimensions: DIMENSIONS,
    scoringRubric: {
      '9-10': 'Exceptional — industry-leading, no significant gaps',
      '7-8': 'Strong — meets most requirements with minor gaps',
      '5-6': 'Adequate — functional but with notable limitations',
      '3-4': 'Weak — significant gaps that impact usability/value',
      '1-2': 'Critical — fundamental issues, not recommended',
    },
    evaluationCriteria: {
      ux: ['Onboarding flow', 'Daily workflow efficiency', 'Mobile experience', 'Accessibility (WCAG 2.1)'],
      technical: ['API design', 'Scalability', 'Reliability (SLA)', 'Performance benchmarks'],
      business: ['Market positioning', 'Pricing competitiveness', 'ROI for target segments', 'Growth potential'],
      compliance: ['GDPR readiness', 'HIPAA compliance', 'SOC 2 Type II', 'Data residency options'],
      innovation: ['Unique features', 'AI/ML capabilities', 'Integration ecosystem', 'Future roadmap'],
    },
  },
  blueprints: [
    {
      role: 'ux-evaluator',
      instructions:
        'Evaluate user experience: onboarding, daily workflows, mobile experience, accessibility. ' +
        'Score each criterion 1-10 and provide an overall UX score.',
      capabilities: ['ux', 'evaluation'],
    },
    {
      role: 'technical-evaluator',
      instructions:
        'Evaluate technical quality: API design, scalability, reliability, performance. ' +
        'Score each criterion 1-10 and provide an overall technical score.',
      capabilities: ['technical', 'evaluation'],
    },
    {
      role: 'business-evaluator',
      instructions:
        'Evaluate business viability: market positioning, pricing, ROI, growth potential. ' +
        'Score each criterion 1-10 and provide an overall business score.',
      capabilities: ['business', 'evaluation'],
    },
    {
      role: 'compliance-evaluator',
      instructions:
        'Evaluate compliance and security: GDPR, HIPAA, SOC 2, data residency. ' +
        'Score each criterion 1-10 and provide an overall compliance score.',
      capabilities: ['compliance', 'evaluation'],
    },
    {
      role: 'innovation-evaluator',
      instructions:
        'Evaluate innovation and differentiation: unique features, AI/ML, integrations, roadmap. ' +
        'Score each criterion 1-10 and provide an overall innovation score.',
      capabilities: ['innovation', 'evaluation'],
    },
  ],
  phases: [
    {
      id: 'independent-assessment',
      type: 'parallel',
      taskTemplate: {
        type: 'dimension_assessment',
        instructionTemplate: 'Assess the product from your specialized dimension. Provide scores and key findings.',
        expectedOutputSchema: {},
      },
      transitionRule: { type: 'all_completed' },
    },
    {
      id: 'cross-dimension-discussion',
      type: 'interactive',
      taskTemplate: {
        type: 'trade_off_discussion',
        instructionTemplate: 'Discuss trade-offs with other evaluators. Identify conflicts and align priorities.',
        expectedOutputSchema: {},
      },
      transitionRule: { type: 'convergence', config: { maxRounds: 2 } },
    },
    {
      id: 'unified-report',
      type: 'aggregate',
      taskTemplate: {
        type: 'final_assessment',
        instructionTemplate: 'Provide your final weighted assessment considering all cross-dimension insights.',
        expectedOutputSchema: {},
      },
      transitionRule: { type: 'all_completed' },
    },
  ],
  convergencePolicy: 'fixedRounds',
  config: {
    maxConcurrentTasks: 10,
    taskTimeoutMinutes: 15,
    maxRetries: 1,
    claimExpiryMinutes: 5,
  },
}

// ─── Main ────────────────────────────────────────────────────

async function main() {
  console.log()
  console.log('╔══════════════════════════════════════════════════════════════╗')
  console.log('║  SwarmFlow Product Evaluation — Multi-Dimensional (REST API) ║')
  console.log('╚══════════════════════════════════════════════════════════════╝')
  console.log()

  // ── Start Server ────────────────────────────────────────────
  console.log('🚀 Starting SwarmFlow server...')
  const server = await startServer({ port: 3212 })
  const client = new SwarmFlowClient(server.baseUrl)
  const executor = new MastraExecutor()
  const convergencePolicy = fixedRounds(2)
  console.log(`   Server running at ${server.baseUrl}`)
  console.log()

  try {
    // ── Step 1: Create Mission via REST API ─────────────────────
    console.log(`📋 Product: ${PRODUCT.name} v${PRODUCT.version}`)
    console.log(`   Category: ${PRODUCT.category}`)
    console.log(`   Target: ${PRODUCT.targetMarket}`)
    console.log()

    console.log('📋 POST /api/missions — Creating evaluation mission')
    const record = await client.createMission(MISSION)
    console.log(`   Mission ID: ${MISSION.id}`)
    console.log(`   Status:     ${record.status}`)
    console.log()

    console.log('📊 Evaluation Dimensions:')
    for (const dim of DIMENSIONS) {
      console.log(`   • ${dim.dimension} (weight: ${(dim.weight * 100).toFixed(0)}%) — ${dim.role}`)
    }
    console.log()

    // ── Step 2: Phase 1 — Independent Assessment (Parallel) ────
    console.log('═══ Phase 1: Independent Assessment (Parallel) ═══')
    console.log()

    const assessmentResults: TaskResult[] = []

    for (let i = 0; i < MISSION.blueprints.length; i++) {
      const bp = MISSION.blueprints[i]
      const dim = DIMENSIONS[i]
      const task = buildTask(
        `assess-${bp.role}`,
        MISSION,
        'independent-assessment',
        i,
        `Assess ${PRODUCT.name} from the ${dim.dimension} perspective. ` +
        `Score each criterion 1-10 and provide an overall dimension score.`,
      )
      console.log(`  📤 POST /api/tasks → POST /claim → Execute → POST /submit → POST /verify`)
      const result = await executeTaskViaAPI(client, executor, task)
      assessmentResults.push(result)
      console.log(`  ✅ ${dim.dimension}: Score ${result.output.score ?? 'N/A'}/10 | ${result.output.freeformAnalysis}`)
      console.log()
    }

    const assessDigest = buildDigest(assessmentResults)
    console.log(`  📊 Assessment Digest: ${assessDigest.totalResults} dimensions evaluated`)
    console.log(`     Avg confidence: ${assessDigest.averageConfidence.toFixed(2)}`)
    console.log()

    // ── Step 3: Phase 2 — Cross-Dimension Discussion (Interactive, 2 Fixed Rounds) ──
    console.log('═══ Phase 2: Cross-Dimension Discussion (2 Fixed Rounds) ═══')
    console.log()

    const thread: InteractionThread = {
      id: 'eval-discussion-1',
      missionId: MISSION.id,
      postTaskId: `assess-${MISSION.blueprints[0].role}`,
      postAuthor: MISSION.blueprints[0],
      participants: MISSION.blueprints.slice(1),
      rounds: [],
      status: 'active',
    }

    let roundNumber = 0
    let shouldContinue = true

    while (shouldContinue) {
      roundNumber++
      const roundInstructions = roundNumber === 1
        ? 'Share your key findings and identify potential conflicts with other dimensions. ' +
          'Where do trade-offs exist between your dimension and others?'
        : 'Resolve identified trade-offs. Adjust your assessment if other dimensions revealed important considerations. ' +
          'Align on priority recommendations.'

      console.log(`  ── Discussion Round ${roundNumber} ──`)

      const roundResults: TaskResult[] = []
      const roundTasks: Task[] = []

      for (let i = 0; i < MISSION.blueprints.length; i++) {
        const bp = MISSION.blueprints[i]
        const dim = DIMENSIONS[i]
        const task = buildTask(
          `discuss-r${roundNumber}-${bp.role}`,
          MISSION,
          'cross-dimension-discussion',
          i,
          `Round ${roundNumber} (${dim.dimension}): ${roundInstructions}`,
          { threadId: thread.id, type: 'trade_off_discussion' },
        )
        const result = await executeTaskViaAPI(client, executor, task)
        roundResults.push(result)
        roundTasks.push(task)
        console.log(`  ✅ ${dim.dimension}: ${result.output.freeformAnalysis}`)
      }

      thread.rounds.push({
        roundNumber,
        tasks: roundTasks,
        results: roundResults,
      })

      shouldContinue = convergencePolicy.shouldThreadContinue(thread)
      console.log(`  📊 Continue discussion: ${shouldContinue}`)
      console.log()
    }

    thread.status = 'converged'

    // ── Step 4: Phase 3 — Unified Report (Aggregate) ──────────
    console.log('═══ Phase 3: Unified Report (Aggregate) ═══')
    console.log()

    const finalResults: TaskResult[] = []

    for (let i = 0; i < MISSION.blueprints.length; i++) {
      const bp = MISSION.blueprints[i]
      const dim = DIMENSIONS[i]
      const task = buildTask(
        `final-${bp.role}`,
        MISSION,
        'unified-report',
        i,
        `Provide your final ${dim.dimension} assessment for ${PRODUCT.name}, ` +
        `incorporating insights from the cross-dimension discussion.`,
      )
      const result = await executeTaskViaAPI(client, executor, task)
      finalResults.push(result)
      console.log(`  ✅ ${dim.dimension}: Score ${result.output.score ?? 'N/A'}/10 | ${result.output.freeformAnalysis}`)
      console.log()
    }

    // ── Query mission status via REST API ────────────────────────
    console.log('  📊 GET /api/missions — Querying mission status')
    const finalMission = await client.getMission(MISSION.id)
    console.log(`     Mission status: ${finalMission.status}`)

    // ── Final Report ───────────────────────────────────────────
    const allResults = [...assessmentResults, ...finalResults]
    const finalDigest = buildDigest(allResults)

    // Calculate weighted score
    let weightedScore = 0
    for (let i = 0; i < finalResults.length; i++) {
      const score = finalResults[i].output.score ?? 5
      weightedScore += score * DIMENSIONS[i].weight
    }

    console.log()
    console.log('╔══════════════════════════════════════════════════════════════╗')
    console.log('║              Product Evaluation Final Report                  ║')
    console.log('╚══════════════════════════════════════════════════════════════╝')
    console.log()
    console.log(`  Product:             ${PRODUCT.name} v${PRODUCT.version}`)
    console.log(`  Category:            ${PRODUCT.category}`)
    console.log(`  Target Market:       ${PRODUCT.targetMarket}`)
    console.log()

    console.log('  ── Dimension Scores ──')
    for (let i = 0; i < DIMENSIONS.length; i++) {
      const dim = DIMENSIONS[i]
      const score = finalResults[i].output.score ?? 'N/A'
      const bar = typeof score === 'number' ? '█'.repeat(score) + '░'.repeat(10 - score) : '??????????'
      console.log(`  ${dim.dimension.padEnd(28)} ${bar} ${score}/10 (weight: ${(dim.weight * 100).toFixed(0)}%)`)
    }
    console.log()

    console.log('  ── Summary ──')
    console.log(`  Total assessments:   ${finalDigest.totalResults}`)
    console.log(`  Avg confidence:      ${finalDigest.averageConfidence.toFixed(2)}`)
    console.log(`  Convergence rate:    ${(finalDigest.convergenceRate * 100).toFixed(0)}%`)
    console.log(`  Key findings:        ${finalDigest.keyArgumentsSummary.length}`)
    console.log(`  Discussion rounds:   ${roundNumber}`)
    console.log()

    // Determine recommendation
    const recommendation =
      weightedScore >= 8.0 ? '✅ STRONGLY RECOMMEND' :
      weightedScore >= 6.5 ? '✅ RECOMMEND' :
      weightedScore >= 5.0 ? '⚠️  RECOMMEND WITH RESERVATIONS' :
      weightedScore >= 3.5 ? '⚠️  NOT RECOMMENDED (needs improvement)' :
      '❌ DO NOT RECOMMEND'

    console.log(`  ══════════════════════════════════════════`)
    console.log(`  Weighted Score:      ${weightedScore.toFixed(1)}/10`)
    console.log(`  Recommendation:      ${recommendation}`)
    console.log(`  ══════════════════════════════════════════`)
    console.log()
    console.log('✨ Product evaluation complete!')
  } finally {
    console.log()
    console.log('🛑 Shutting down server...')
    await server.close()
    console.log('   Server stopped.')
    console.log()
  }
}

main().catch(console.error)
