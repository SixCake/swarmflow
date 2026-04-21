// End-to-end Mission lifecycle integration test
// Tests: create mission → publish tasks → claim → execute → submit → verify → convergence

import { describe, it, expect, beforeEach } from 'vitest'
import { MissionManager } from '../../src/core/mission-manager.js'
import { TaskBoard } from '../../src/core/task-board.js'
import { DAGEngine } from '../../src/core/dag-engine.js'
import { MastraExecutor } from '../../src/worker/mastra-executor.js'
import { buildDigest } from '../../src/core/digest.js'
import { mutualIntent } from '../../src/core/convergence.js'
import { SchemaValidator } from '../../src/core/schema-validator.js'
import type { Mission } from '../../src/types/mission.types.js'
import type { Task } from '../../src/types/task.types.js'
import type { InteractionThread } from '../../src/types/thread.types.js'

function createTestMission(): Mission {
  return {
    id: 'mission-lifecycle-test',
    goal: 'Debate whether AI should be regulated',
    context: { topic: 'AI Regulation' },
    blueprints: [
      { role: 'proponent', instructions: 'Argue in favor of AI regulation', capabilities: ['debate'] },
      { role: 'opponent', instructions: 'Argue against AI regulation', capabilities: ['debate'] },
      { role: 'moderator', instructions: 'Moderate the debate', capabilities: ['moderate'] },
    ],
    phases: [
      {
        id: 'phase-parallel',
        type: 'parallel',
        taskTemplate: {
          type: 'independent_opinion',
          instructionTemplate: 'Share your initial stance on AI regulation',
          expectedOutputSchema: {},
        },
        transitionRule: { type: 'all_completed' },
      },
      {
        id: 'phase-interactive',
        type: 'interactive',
        taskTemplate: {
          type: 'comment',
          instructionTemplate: 'Respond to other viewpoints',
          expectedOutputSchema: {},
        },
        transitionRule: { type: 'convergence' },
      },
      {
        id: 'phase-aggregate',
        type: 'aggregate',
        taskTemplate: {
          type: 'final_stance',
          instructionTemplate: 'Provide your final stance',
          expectedOutputSchema: {},
        },
        transitionRule: { type: 'all_completed' },
      },
    ],
    convergencePolicy: 'mutualIntent',
    config: {
      maxConcurrentTasks: 10,
      taskTimeoutMinutes: 30,
      maxRetries: 3,
      claimExpiryMinutes: 5,
    },
  }
}

describe('Mission Lifecycle Integration', () => {
  let missionManager: MissionManager
  let taskBoard: TaskBoard
  let dagEngine: DAGEngine
  let executor: MastraExecutor
  let validator: SchemaValidator

  beforeEach(() => {
    missionManager = new MissionManager()
    taskBoard = new TaskBoard()
    dagEngine = new DAGEngine(taskBoard)
    executor = new MastraExecutor()
    validator = new SchemaValidator()
  })

  it('should complete a full mission lifecycle', async () => {
    const mission = createTestMission()

    // Step 1: Create mission
    const record = missionManager.createMission(mission)
    expect(record.status).toBe('created')
    missionManager.updateStatus(mission.id, 'running')
    expect(missionManager.getMission(mission.id)!.status).toBe('running')

    // Step 2: Initialize DAG engine
    await dagEngine.initialize(mission)
    const phase = dagEngine.getCurrentPhase()
    expect(phase).toBeDefined()
    expect(phase!.id).toBe('phase-parallel')

    // Step 3: Publish tasks for parallel phase
    const tasks: Task[] = mission.blueprints.map((bp, i) => ({
      id: `task-parallel-${i}`,
      missionId: mission.id,
      phaseId: 'phase-parallel',
      type: 'independent_opinion',
      blueprint: bp,
      instructions: 'Share your initial stance on AI regulation',
      context: mission.context,
      expectedOutputSchema: {},
      status: 'published' as const,
      retryCount: 0,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 1800000),
    }))

    tasks.forEach(t => taskBoard.publish(t))
    expect(taskBoard.getAvailableTasks()).toHaveLength(3)

    // Step 4: Workers claim and execute tasks
    for (const task of tasks) {
      const claimed = taskBoard.claim(task.id, `worker-${task.id}`)
      expect(claimed).toBe(true)

      const result = await executor.execute(task)
      expect(result.metadata.agentFramework).toBe('mastra')

      // Validate result
      const validation = validator.validate(result.output, {})
      expect(validation.valid).toBe(true)

      const submitted = taskBoard.submit(task.id, result)
      expect(submitted).toBe(true)

      const verified = taskBoard.verify(task.id)
      expect(verified).toBe(true)
    }

    // Step 5: All parallel tasks completed
    expect(taskBoard.getAvailableTasks()).toHaveLength(0)
    const completedTasks = taskBoard.getTasksByPhase(mission.id, 'phase-parallel')
    expect(completedTasks.every(t => t.status === 'verified')).toBe(true)

    // Step 6: Build digest from results
    const results = completedTasks.map(t => t.result!).filter(Boolean)
    const digest = buildDigest(results)
    expect(digest.totalResults).toBe(3)
    expect(digest.averageConfidence).toBeGreaterThan(0)

    // Step 7: Advance to interactive phase (tasks are verified, so transition should succeed)
    const advanced = await dagEngine.advanceToNextPhase()
    expect(advanced).toBe(true)
    expect(dagEngine.getCurrentPhase()!.id).toBe('phase-interactive')

    // Step 8: Create interaction threads (using DAGEngine naming convention)
    const threadId = 'phase-interactive-thread-proponent'
    const thread: InteractionThread = {
      id: threadId,
      missionId: mission.id,
      postTaskId: tasks[0].id,
      postAuthor: mission.blueprints[0],
      participants: mission.blueprints.slice(1),
      rounds: [],
      status: 'active',
    }
    dagEngine.setThread(thread)
    expect(dagEngine.getThread(threadId)).toBeDefined()

    // Step 9: Simulate one round of interaction
    const roundTasks: Task[] = mission.blueprints.slice(1).map((bp, i) => ({
      id: `task-interactive-${i}`,
      missionId: mission.id,
      phaseId: 'phase-interactive',
      threadId,
      type: 'comment',
      blueprint: bp,
      instructions: 'Respond to the initial stance',
      context: { ...mission.context, digest },
      expectedOutputSchema: {},
      status: 'published' as const,
      retryCount: 0,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 1800000),
    }))

    for (const task of roundTasks) {
      taskBoard.publish(task)
      taskBoard.claim(task.id, `worker-${task.id}`)
      const result = await executor.execute(task)
      taskBoard.submit(task.id, result)
      taskBoard.verify(task.id)
    }

    // Step 10: Check convergence
    const roundResults = roundTasks.map(t => taskBoard.getTask(t.id)!.result!)
    thread.rounds.push({
      roundNumber: 1,
      tasks: roundTasks,
      results: roundResults,
    })

    const shouldContinue = mutualIntent.shouldThreadContinue(thread)
    // Since MastraExecutor returns wantsContinue: false, thread should converge
    expect(shouldContinue).toBe(false)
    thread.status = 'converged'

    // Step 11: Check phase completion
    const phaseComplete = mutualIntent.isPhaseComplete([thread])
    expect(phaseComplete).toBe(true)

    // Step 12: Advance to aggregate phase
    const advancedAgain = await dagEngine.advanceToNextPhase()
    expect(advancedAgain).toBe(true)
    expect(dagEngine.getCurrentPhase()!.id).toBe('phase-aggregate')

    // Step 13: Complete mission (valid transition: running → completed)
    missionManager.updateStatus(mission.id, 'completed')
    expect(missionManager.getMission(mission.id)!.status).toBe('completed')
  })

  it('should handle task rejection and retry', async () => {
    const mission = createTestMission()
    missionManager.createMission(mission)

    const task: Task = {
      id: 'task-retry-test',
      missionId: mission.id,
      phaseId: 'phase-parallel',
      type: 'independent_opinion',
      blueprint: mission.blueprints[0],
      instructions: 'Test retry',
      context: {},
      expectedOutputSchema: {},
      status: 'published',
      retryCount: 0,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 1800000),
    }

    taskBoard.publish(task)

    // First attempt: claim, submit, reject
    taskBoard.claim('task-retry-test', 'worker-1')
    const result = await executor.execute(task)
    taskBoard.submit('task-retry-test', result)
    taskBoard.reject('task-retry-test')

    // Task should be re-published with incremented retry count
    const retried = taskBoard.getTask('task-retry-test')!
    expect(retried.status).toBe('published')
    expect(retried.retryCount).toBe(1)

    // Second attempt: claim, submit, verify
    taskBoard.claim('task-retry-test', 'worker-2')
    const result2 = await executor.execute(task)
    taskBoard.submit('task-retry-test', result2)
    taskBoard.verify('task-retry-test')
    expect(taskBoard.getTask('task-retry-test')!.status).toBe('verified')
  })

  it('should build digest across multiple phases', async () => {
    const mission = createTestMission()
    missionManager.createMission(mission)

    // Create and complete tasks
    const tasks: Task[] = Array.from({ length: 5 }, (_, i) => ({
      id: `task-digest-${i}`,
      missionId: mission.id,
      phaseId: 'phase-parallel',
      type: 'independent_opinion',
      blueprint: { role: `agent-${i}`, instructions: `Agent ${i} instructions` },
      instructions: 'Analyze',
      context: {},
      expectedOutputSchema: {},
      status: 'published' as const,
      retryCount: 0,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 1800000),
    }))

    for (const task of tasks) {
      taskBoard.publish(task)
      taskBoard.claim(task.id, `worker-${task.id}`)
      const result = await executor.execute(task)
      taskBoard.submit(task.id, result)
      taskBoard.verify(task.id)
    }

    const results = tasks.map(t => taskBoard.getTask(t.id)!.result!)
    const digest = buildDigest(results)

    expect(digest.totalResults).toBe(5)
    expect(digest.averageConfidence).toBeGreaterThan(0)
    expect(digest.convergenceRate).toBe(1) // All wantsContinue: false
  })
})
