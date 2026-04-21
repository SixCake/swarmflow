#!/usr/bin/env npx tsx
// SwarmFlow CLI Demo — 3 Agent Debate
// Usage: npx tsx examples/demo.ts

import { SwarmFlow } from '../src/swarm-flow.js'
import { TaskBoard } from '../src/core/task-board.js'
import { MastraExecutor } from '../src/worker/mastra-executor.js'
import { buildDigest } from '../src/core/digest.js'
import { mutualIntent } from '../src/core/convergence.js'
import type { Mission } from '../src/types/mission.types.js'
import type { Task } from '../src/types/task.types.js'
import type { InteractionThread } from '../src/types/thread.types.js'

// ─── Configuration ───────────────────────────────────────────

const MISSION: Mission = {
  id: 'demo-debate-001',
  goal: 'Debate: Should AI development be regulated by governments?',
  context: {
    topic: 'AI Regulation',
    background: 'Rapid AI advancement raises questions about safety, ethics, and governance.',
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
  console.log('╔══════════════════════════════════════════════════╗')
  console.log('║          SwarmFlow Demo — 3 Agent Debate        ║')
  console.log('╚══════════════════════════════════════════════════╝')
  console.log()

  const swarmFlow = new SwarmFlow()
  const taskBoard = new TaskBoard()
  const executor = new MastraExecutor()

  // Step 1: Create Mission
  console.log('📋 Creating mission:', MISSION.goal)
  const record = swarmFlow.createMission(MISSION)
  console.log(`   Status: ${record.status}`)
  console.log()

  // Step 2: Phase 1 — Opening Statements (Parallel)
  console.log('═══ Phase 1: Opening Statements (Parallel) ═══')
  const openingTasks: Task[] = MISSION.blueprints.map((bp, i) => ({
    id: `opening-${i}`,
    missionId: MISSION.id,
    phaseId: 'opening-statements',
    type: 'independent_opinion',
    blueprint: bp,
    instructions: 'Share your opening statement on AI regulation.',
    context: MISSION.context,
    expectedOutputSchema: {},
    status: 'published' as const,
    retryCount: 0,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 300000),
  }))

  for (const task of openingTasks) {
    taskBoard.publish(task)
    taskBoard.claim(task.id, `worker-${task.blueprint.role}`)
    const result = await executor.execute(task)
    taskBoard.submit(task.id, result)
    taskBoard.verify(task.id)
    console.log(`   ✅ ${task.blueprint.role}: ${result.output.freeformAnalysis}`)
  }

  // Build digest
  const openingResults = openingTasks.map(t => taskBoard.getTask(t.id)!.result!)
  const digest1 = buildDigest(openingResults)
  console.log()
  console.log(`   📊 Digest: ${digest1.totalResults} results, avg confidence: ${digest1.averageConfidence.toFixed(2)}`)
  console.log()

  // Step 3: Phase 2 — Debate Rounds (Interactive)
  console.log('═══ Phase 2: Debate Rounds (Interactive) ═══')

  const thread: InteractionThread = {
    id: 'debate-thread-1',
    missionId: MISSION.id,
    postTaskId: openingTasks[0].id,
    postAuthor: MISSION.blueprints[0],
    participants: MISSION.blueprints.slice(1),
    rounds: [],
    status: 'active',
  }

  let roundNumber = 0
  let converged = false

  while (!converged && roundNumber < 3) {
    roundNumber++
    console.log(`   --- Round ${roundNumber} ---`)

    const roundTasks: Task[] = MISSION.blueprints.map((bp, i) => ({
      id: `debate-r${roundNumber}-${i}`,
      missionId: MISSION.id,
      phaseId: 'debate-rounds',
      threadId: thread.id,
      type: 'comment',
      blueprint: bp,
      instructions: `Round ${roundNumber}: Respond to the debate. Consider the digest.`,
      context: { ...MISSION.context, digest: digest1 },
      expectedOutputSchema: {},
      status: 'published' as const,
      retryCount: 0,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 300000),
    }))

    const roundResults = []
    for (const task of roundTasks) {
      taskBoard.publish(task)
      taskBoard.claim(task.id, `worker-${task.blueprint.role}`)
      const result = await executor.execute(task)
      taskBoard.submit(task.id, result)
      taskBoard.verify(task.id)
      roundResults.push(result)
      console.log(`   ✅ ${task.blueprint.role}: ${result.output.freeformAnalysis}`)
    }

    thread.rounds.push({
      roundNumber,
      tasks: roundTasks,
      results: roundResults,
    })

    converged = !mutualIntent.shouldThreadContinue(thread)
    console.log(`   📊 Converged: ${converged}`)
    console.log()
  }

  thread.status = 'converged'

  // Step 4: Phase 3 — Closing Statements (Aggregate)
  console.log('═══ Phase 3: Closing Statements (Aggregate) ═══')

  const closingTasks: Task[] = MISSION.blueprints.map((bp, i) => ({
    id: `closing-${i}`,
    missionId: MISSION.id,
    phaseId: 'closing-statements',
    type: 'final_stance',
    blueprint: bp,
    instructions: 'Provide your final stance considering all arguments.',
    context: MISSION.context,
    expectedOutputSchema: {},
    status: 'published' as const,
    retryCount: 0,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 300000),
  }))

  for (const task of closingTasks) {
    taskBoard.publish(task)
    taskBoard.claim(task.id, `worker-${task.blueprint.role}`)
    const result = await executor.execute(task)
    taskBoard.submit(task.id, result)
    taskBoard.verify(task.id)
    console.log(`   ✅ ${task.blueprint.role}: ${result.output.freeformAnalysis}`)
  }

  // Final digest
  const allResults = [
    ...openingTasks,
    ...closingTasks,
  ].map(t => taskBoard.getTask(t.id)!.result!)
  const finalDigest = buildDigest(allResults)

  console.log()
  console.log('╔══════════════════════════════════════════════════╗')
  console.log('║                  Final Report                    ║')
  console.log('╚══════════════════════════════════════════════════╝')
  console.log(`  Total results:       ${finalDigest.totalResults}`)
  console.log(`  Avg confidence:      ${finalDigest.averageConfidence.toFixed(2)}`)
  console.log(`  Convergence rate:    ${(finalDigest.convergenceRate * 100).toFixed(0)}%`)
  console.log(`  Key arguments:       ${finalDigest.keyArgumentsSummary.length}`)
  console.log(`  Debate rounds:       ${roundNumber}`)
  console.log(`  Mission status:      completed`)
  console.log()
  console.log('✨ Demo complete!')
}

main().catch(console.error)
