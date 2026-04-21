#!/usr/bin/env npx tsx
/**
 * SwarmFlow Code Review — Distributed Multi-Agent Review (via REST API)
 *
 * Demonstrates a 4-agent code review workflow through HTTP REST API where
 * specialized reviewers analyze code from different perspectives and converge
 * on a unified assessment.
 *
 * Usage: npx tsx examples/code-review/index.ts
 */

import { startServer } from '../shared/server-helper.js'
import { SwarmFlowClient } from '../shared/api-client.js'
import { MastraExecutor } from '../../src/worker/mastra-executor.js'
import { buildDigest } from '../../src/core/digest.js'
import { bothAgree } from '../../src/core/convergence.js'
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
    expiresAt: new Date(Date.now() + 10 * 60_000),
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

// ─── Sample Code Under Review ────────────────────────────────

const CODE_UNDER_REVIEW = `
// File: src/api/users.ts — Pull Request #42
export async function getUser(req: Request, res: Response) {
  const userId = req.params.id;
  const query = \`SELECT * FROM users WHERE id = '\${userId}'\`;
  const result = await db.query(query);
  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Not found' });
  }
  const user = result.rows[0];
  delete user.password_hash;
  res.json(user);
}

export async function listUsers(req: Request, res: Response) {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 100;
  const result = await db.query('SELECT * FROM users LIMIT $1 OFFSET $2', [limit, (page - 1) * limit]);
  res.json({ users: result.rows, total: result.rowCount });
}
`.trim()

// ─── Mission Definition ──────────────────────────────────────

const MISSION: Mission = {
  id: 'code-review-pr42',
  goal: 'Review Pull Request #42: User API endpoints',
  context: {
    pullRequest: '#42',
    repository: 'acme/backend',
    files: ['src/api/users.ts'],
    code: CODE_UNDER_REVIEW,
    language: 'TypeScript',
    framework: 'Express.js',
  },
  blueprints: [
    {
      role: 'security-reviewer',
      instructions:
        'Focus on security vulnerabilities: SQL injection, XSS, auth bypass, data exposure. ' +
        'Rate severity as critical/high/medium/low.',
      capabilities: ['security', 'analysis'],
    },
    {
      role: 'performance-reviewer',
      instructions:
        'Focus on performance: query efficiency, N+1 problems, pagination, caching opportunities. ' +
        'Estimate impact as high/medium/low.',
      capabilities: ['performance', 'analysis'],
    },
    {
      role: 'maintainability-reviewer',
      instructions:
        'Focus on code quality: naming, SOLID principles, error handling, type safety, readability. ' +
        'Suggest concrete improvements.',
      capabilities: ['quality', 'analysis'],
    },
    {
      role: 'architecture-reviewer',
      instructions:
        'Focus on design: separation of concerns, API design, data layer abstraction, scalability. ' +
        'Evaluate against REST best practices.',
      capabilities: ['architecture', 'analysis'],
    },
  ],
  phases: [
    {
      id: 'independent-review',
      type: 'parallel',
      taskTemplate: {
        type: 'code_review',
        instructionTemplate: 'Review the code from your specialized perspective. Provide a score (1-10) and key findings.',
        expectedOutputSchema: {},
      },
      transitionRule: { type: 'all_completed' },
    },
    {
      id: 'discussion',
      type: 'interactive',
      taskTemplate: {
        type: 'review_discussion',
        instructionTemplate: 'Discuss disagreements with other reviewers and refine your assessment.',
        expectedOutputSchema: {},
      },
      transitionRule: { type: 'convergence' },
    },
    {
      id: 'final-assessment',
      type: 'aggregate',
      taskTemplate: {
        type: 'final_verdict',
        instructionTemplate: 'Provide your final review verdict considering all perspectives.',
        expectedOutputSchema: {},
      },
      transitionRule: { type: 'all_completed' },
    },
  ],
  convergencePolicy: 'bothAgree',
  config: {
    maxConcurrentTasks: 10,
    taskTimeoutMinutes: 10,
    maxRetries: 1,
    claimExpiryMinutes: 5,
  },
}

// ─── Main ────────────────────────────────────────────────────

async function main() {
  console.log()
  console.log('╔══════════════════════════════════════════════════════════╗')
  console.log('║  SwarmFlow Code Review — Multi-Agent Review (REST API)  ║')
  console.log('╚══════════════════════════════════════════════════════════╝')
  console.log()

  // ── Start Server ────────────────────────────────────────────
  console.log('🚀 Starting SwarmFlow server...')
  const server = await startServer({ port: 3211 })
  const client = new SwarmFlowClient(server.baseUrl)
  const executor = new MastraExecutor()
  console.log(`   Server running at ${server.baseUrl}`)
  console.log()

  try {
    // ── Step 1: Create Mission via REST API ─────────────────────
    console.log('📋 POST /api/missions — Creating review mission')
    const record = await client.createMission(MISSION)
    console.log(`   PR:     ${MISSION.context.pullRequest}`)
    console.log(`   Repo:   ${MISSION.context.repository}`)
    console.log(`   Status: ${record.status}`)
    console.log()

    console.log('📄 Code under review:')
    console.log('   ─────────────────────────────────────')
    CODE_UNDER_REVIEW.split('\n').forEach(line => console.log(`   ${line}`))
    console.log('   ─────────────────────────────────────')
    console.log()

    // ── Step 2: Phase 1 — Independent Review (Parallel) ────────
    console.log('═══ Phase 1: Independent Review (Parallel) ═══')
    console.log()

    const reviewResults: TaskResult[] = []

    for (let i = 0; i < MISSION.blueprints.length; i++) {
      const bp = MISSION.blueprints[i]
      const task = buildTask(
        `review-${bp.role}`,
        MISSION,
        'independent-review',
        i,
        `Review the code from a ${bp.role.replace('-', ' ')} perspective. Provide a score (1-10) and key findings.`,
      )
      console.log(`  📤 POST /api/tasks — Publish → POST /claim → Execute → POST /submit → POST /verify`)
      const result = await executeTaskViaAPI(client, executor, task)
      reviewResults.push(result)
      console.log(`  ✅ ${bp.role}: Score ${result.output.score ?? 'N/A'}/10 | ${result.output.freeformAnalysis}`)
      console.log()
    }

    const reviewDigest = buildDigest(reviewResults)
    console.log(`  📊 Review Digest: ${reviewDigest.totalResults} reviews, avg confidence: ${reviewDigest.averageConfidence.toFixed(2)}`)
    console.log()

    // ── Step 3: Phase 2 — Discussion (Interactive) ─────────────
    console.log('═══ Phase 2: Discussion (Interactive) ═══')
    console.log()

    const thread: InteractionThread = {
      id: 'review-discussion-1',
      missionId: MISSION.id,
      postTaskId: `review-${MISSION.blueprints[0].role}`,
      postAuthor: MISSION.blueprints[0],
      participants: MISSION.blueprints.slice(1),
      rounds: [],
      status: 'active',
    }

    let roundNumber = 0
    let converged = false

    while (!converged && roundNumber < 3) {
      roundNumber++
      console.log(`  ── Discussion Round ${roundNumber} ──`)

      const roundResults: TaskResult[] = []
      const roundTasks: Task[] = []

      for (let i = 0; i < MISSION.blueprints.length; i++) {
        const bp = MISSION.blueprints[i]
        const task = buildTask(
          `discuss-r${roundNumber}-${bp.role}`,
          MISSION,
          'discussion',
          i,
          `Round ${roundNumber}: Discuss your findings with other reviewers. Address any disagreements.`,
          { threadId: thread.id, type: 'review_discussion' },
        )
        const result = await executeTaskViaAPI(client, executor, task)
        roundResults.push(result)
        roundTasks.push(task)
        console.log(`  ✅ ${bp.role}: ${result.output.freeformAnalysis}`)
      }

      thread.rounds.push({
        roundNumber,
        tasks: roundTasks,
        results: roundResults,
      })

      converged = !bothAgree.shouldThreadContinue(thread)
      console.log(`  📊 Consensus reached: ${converged}`)
      console.log()
    }

    thread.status = 'converged'

    // ── Step 4: Phase 3 — Final Assessment (Aggregate) ─────────
    console.log('═══ Phase 3: Final Assessment (Aggregate) ═══')
    console.log()

    const verdictResults: TaskResult[] = []

    for (let i = 0; i < MISSION.blueprints.length; i++) {
      const bp = MISSION.blueprints[i]
      const task = buildTask(
        `verdict-${bp.role}`,
        MISSION,
        'final-assessment',
        i,
        'Provide your final review verdict considering all discussion points.',
      )
      const result = await executeTaskViaAPI(client, executor, task)
      verdictResults.push(result)
      console.log(`  ✅ ${bp.role}: Score ${result.output.score ?? 'N/A'}/10 | ${result.output.freeformAnalysis}`)
    }

    // ── Final Report ───────────────────────────────────────────
    const allResults = [...reviewResults, ...verdictResults]
    const finalDigest = buildDigest(allResults)

    console.log()
    console.log('╔══════════════════════════════════════════════════════════╗')
    console.log('║               Code Review Final Report                   ║')
    console.log('╚══════════════════════════════════════════════════════════╝')
    console.log(`  Pull Request:        ${MISSION.context.pullRequest}`)
    console.log(`  Repository:          ${MISSION.context.repository}`)
    console.log(`  Reviewers:           ${MISSION.blueprints.length}`)
    console.log(`  Total assessments:   ${finalDigest.totalResults}`)
    console.log(`  Avg confidence:      ${finalDigest.averageConfidence.toFixed(2)}`)
    console.log(`  Convergence rate:    ${(finalDigest.convergenceRate * 100).toFixed(0)}%`)
    console.log(`  Key findings:        ${finalDigest.keyArgumentsSummary.length}`)
    console.log(`  Discussion rounds:   ${roundNumber}`)
    console.log()

    const avgScore = allResults.reduce((sum, r) => sum + (r.output.score ?? 5), 0) / allResults.length
    const recommendation = avgScore >= 7 ? '✅ APPROVE' : avgScore >= 5 ? '⚠️  REQUEST CHANGES' : '❌ REJECT'
    console.log(`  Overall Score:       ${avgScore.toFixed(1)}/10`)
    console.log(`  Recommendation:      ${recommendation}`)
    console.log()
    console.log('✨ Code review complete!')
  } finally {
    console.log()
    console.log('🛑 Shutting down server...')
    await server.close()
    console.log('   Server stopped.')
    console.log()
  }
}

main().catch(console.error)
