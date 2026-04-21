#!/usr/bin/env npx tsx
/**
 * SwarmFlow Quick Start — 3 Agent Debate (via REST API)
 *
 * Demonstrates the core SwarmFlow workflow through HTTP REST API:
 *   Start Server → Create Mission → Publish Tasks → Claim → Execute → Submit → Verify → Digest
 *
 * Usage: npx tsx examples/quick-start/index.ts
 */

import { startServer } from '../shared/server-helper.js'
import { SwarmFlowClient } from '../shared/api-client.js'
import { MastraExecutor } from '../../src/worker/mastra-executor.js'
import { buildDigest } from '../../src/core/digest.js'
import { mutualIntent } from '../../src/core/convergence.js'
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
    expiresAt: new Date(Date.now() + 5 * 60_000),
  }
}

// ─── Helper: execute a task through full REST API lifecycle ──

async function executeTaskViaAPI(
  client: SwarmFlowClient,
  executor: MastraExecutor,
  task: Task,
): Promise<TaskResult> {
  // 1. Publish task via REST API
  await client.publishTask(task)

  // 2. Claim task via REST API
  await client.claimTask(task.id, `worker-${task.blueprint.role}`)

  // 3. Execute locally (Mastra Agent placeholder)
  const result = await executor.execute(task)

  // 4. Submit result via REST API
  await client.submitTask(task.id, result)

  // 5. Verify task via REST API
  await client.verifyTask(task.id)

  return result
}

// ─── Mission Definition ──────────────────────────────────────

const MISSION: Mission = {
  id: 'quickstart-debate-001',
  goal: 'Debate: Should AI development be regulated by governments?',
  context: {
    topic: 'AI Regulation',
    background:
      'Rapid AI advancement raises questions about safety, ethics, and governance. ' +
      'Proponents argue regulation prevents harm; opponents argue it stifles innovation.',
  },
  blueprints: [
    {
      role: 'proponent',
      instructions: 'You strongly believe AI should be regulated. Provide evidence-based arguments.',
      capabilities: ['debate', 'analysis'],
    },
    {
      role: 'opponent',
      instructions: 'You believe AI regulation would stifle innovation. Argue against regulation.',
      capabilities: ['debate', 'analysis'],
    },
    {
      role: 'moderator',
      instructions: 'You are neutral. Summarize key points and identify areas of agreement/disagreement.',
      capabilities: ['moderate', 'synthesis'],
    },
  ],
  phases: [
    {
      id: 'opening-statements',
      type: 'parallel',
      taskTemplate: {
        type: 'independent_opinion',
        instructionTemplate: 'Share your opening statement on AI regulation.',
        expectedOutputSchema: {},
      },
      transitionRule: { type: 'all_completed' },
    },
    {
      id: 'debate-rounds',
      type: 'interactive',
      taskTemplate: {
        type: 'comment',
        instructionTemplate: 'Respond to other viewpoints based on the digest.',
        expectedOutputSchema: {},
      },
      transitionRule: { type: 'convergence' },
    },
    {
      id: 'closing-statements',
      type: 'aggregate',
      taskTemplate: {
        type: 'final_stance',
        instructionTemplate: 'Provide your final stance considering all arguments.',
        expectedOutputSchema: {},
      },
      transitionRule: { type: 'all_completed' },
    },
  ],
  convergencePolicy: 'mutualIntent',
  config: {
    maxConcurrentTasks: 10,
    taskTimeoutMinutes: 5,
    maxRetries: 2,
    claimExpiryMinutes: 2,
  },
}

// ─── Main ────────────────────────────────────────────────────

async function main() {
  console.log()
  console.log('╔══════════════════════════════════════════════════════╗')
  console.log('║   SwarmFlow Quick Start — 3 Agent Debate (REST API) ║')
  console.log('╚══════════════════════════════════════════════════════╝')
  console.log()

  // ── Start Server ────────────────────────────────────────────
  console.log('🚀 Starting SwarmFlow server...')
  const server = await startServer({ port: 3210 })
  const client = new SwarmFlowClient(server.baseUrl)
  const executor = new MastraExecutor()
  console.log(`   Server running at ${server.baseUrl}`)
  console.log()

  try {
    // ── Health Check ────────────────────────────────────────────
    const health = await client.health()
    console.log(`   Health: ${health.status} (${health.timestamp})`)
    console.log()

    // ── Step 1: Create Mission via REST API ─────────────────────
    console.log('📋 POST /api/missions — Creating mission')
    const record = await client.createMission(MISSION)
    console.log(`   Mission ID: ${MISSION.id}`)
    console.log(`   Status:     ${record.status}`)
    console.log()

    // ── Step 2: Phase 1 — Opening Statements (Parallel) ────────
    console.log('═══ Phase 1: Opening Statements (Parallel) ═══')
    console.log()

    const openingResults: TaskResult[] = []

    for (let i = 0; i < MISSION.blueprints.length; i++) {
      const bp = MISSION.blueprints[i]
      const task = buildTask(
        `opening-${i}`,
        MISSION,
        'opening-statements',
        i,
        'Share your opening statement on AI regulation.',
      )
      console.log(`  📤 POST /api/tasks — Publishing task: ${task.id}`)
      console.log(`  📥 POST /api/tasks/${task.id}/claim — Claiming as worker-${bp.role}`)
      console.log(`  ⚙️  Executing locally via MastraExecutor...`)
      const result = await executeTaskViaAPI(client, executor, task)
      openingResults.push(result)
      console.log(`  📤 POST /api/tasks/${task.id}/submit — Submitting result`)
      console.log(`  ✅ POST /api/tasks/${task.id}/verify — Verified`)

      // Query task status via REST API
      const taskStatus = await client.getTask(task.id)
      console.log(`  📊 GET /api/tasks/${task.id} — Status: ${taskStatus.status}`)
      console.log(`     ${bp.role}: ${result.output.freeformAnalysis}`)
      console.log()
    }

    const digest1 = buildDigest(openingResults)
    console.log(`  📊 Digest: ${digest1.totalResults} results, avg confidence: ${digest1.averageConfidence.toFixed(2)}`)
    console.log()

    // ── Step 3: Phase 2 — Debate Rounds (Interactive) ──────────
    console.log('═══ Phase 2: Debate Rounds (Interactive) ═══')
    console.log()

    const thread: InteractionThread = {
      id: 'debate-thread-1',
      missionId: MISSION.id,
      postTaskId: 'opening-0',
      postAuthor: MISSION.blueprints[0],
      participants: MISSION.blueprints.slice(1),
      rounds: [],
      status: 'active',
    }

    let roundNumber = 0
    let converged = false

    while (!converged && roundNumber < 5) {
      roundNumber++
      console.log(`  ── Round ${roundNumber} ──`)

      const roundResults: TaskResult[] = []
      const roundTasks: Task[] = []

      for (let i = 0; i < MISSION.blueprints.length; i++) {
        const bp = MISSION.blueprints[i]
        const task = buildTask(
          `debate-r${roundNumber}-${i}`,
          MISSION,
          'debate-rounds',
          i,
          `Round ${roundNumber}: Respond to the debate. Consider the digest and previous arguments.`,
          { threadId: thread.id, type: 'comment' },
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

      converged = !mutualIntent.shouldThreadContinue(thread)
      console.log(`  📊 Converged: ${converged}`)
      console.log()
    }

    thread.status = 'converged'

    // ── Step 4: Phase 3 — Closing Statements (Aggregate) ───────
    console.log('═══ Phase 3: Closing Statements (Aggregate) ═══')
    console.log()

    const closingResults: TaskResult[] = []

    for (let i = 0; i < MISSION.blueprints.length; i++) {
      const bp = MISSION.blueprints[i]
      const task = buildTask(
        `closing-${i}`,
        MISSION,
        'closing-statements',
        i,
        'Provide your final stance considering all arguments presented.',
      )
      const result = await executeTaskViaAPI(client, executor, task)
      closingResults.push(result)
      console.log(`  ✅ ${bp.role}: ${result.output.freeformAnalysis}`)
    }

    // ── Query final mission status via REST API ──────────────────
    console.log()
    console.log('  📊 GET /api/missions — Querying mission status')
    const finalMission = await client.getMission(MISSION.id)
    console.log(`     Mission status: ${finalMission.status}`)

    // ── Final Report ───────────────────────────────────────────
    const allResults = [...openingResults, ...closingResults]
    const finalDigest = buildDigest(allResults)

    console.log()
    console.log('╔══════════════════════════════════════════════════════╗')
    console.log('║                   Final Report                       ║')
    console.log('╚══════════════════════════════════════════════════════╝')
    console.log(`  Total results:       ${finalDigest.totalResults}`)
    console.log(`  Avg confidence:      ${finalDigest.averageConfidence.toFixed(2)}`)
    console.log(`  Convergence rate:    ${(finalDigest.convergenceRate * 100).toFixed(0)}%`)
    console.log(`  Key arguments:       ${finalDigest.keyArgumentsSummary.length}`)
    console.log(`  Debate rounds:       ${roundNumber}`)
    console.log(`  Mission status:      completed`)
    console.log()
    console.log('✨ Quick Start demo complete!')
  } finally {
    // ── Stop Server ───────────────────────────────────────────
    console.log()
    console.log('🛑 Shutting down server...')
    await server.close()
    console.log('   Server stopped.')
    console.log()
  }
}

main().catch(console.error)
