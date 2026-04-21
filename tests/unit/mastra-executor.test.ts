import { describe, it, expect } from 'vitest'
import { MastraExecutor } from '../../src/worker/mastra-executor.js'
import type { Task } from '../../src/types/task.types.js'

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    missionId: 'mission-1',
    phaseId: 'phase-1',
    type: 'independent_opinion',
    blueprint: { role: 'analyst', instructions: 'Analyze the topic', capabilities: ['analysis'] },
    instructions: 'Provide your analysis',
    context: { topic: 'AI Safety' },
    expectedOutputSchema: {},
    status: 'claimed',
    retryCount: 0,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 3600000),
    ...overrides,
  }
}

describe('MastraExecutor', () => {
  let executor: MastraExecutor

  beforeEach(() => {
    executor = new MastraExecutor()
  })

  it('should execute a task and return a TaskResult', async () => {
    const task = makeTask()
    const result = await executor.execute(task)
    expect(result).toBeDefined()
    expect(result.output).toBeDefined()
    expect(result.metadata).toBeDefined()
  })

  it('should return output with freeformAnalysis', async () => {
    const task = makeTask()
    const result = await executor.execute(task)
    expect(result.output.freeformAnalysis).toBeDefined()
    expect(typeof result.output.freeformAnalysis).toBe('string')
  })

  it('should return output with score', async () => {
    const task = makeTask()
    const result = await executor.execute(task)
    expect(result.output.score).toBeDefined()
    expect(typeof result.output.score).toBe('number')
  })

  it('should return metadata with agentFramework set to mastra', async () => {
    const task = makeTask()
    const result = await executor.execute(task)
    expect(result.metadata.agentFramework).toBe('mastra')
  })

  it('should return metadata with confidence', async () => {
    const task = makeTask()
    const result = await executor.execute(task)
    expect(result.metadata.confidence).toBeDefined()
    expect(result.metadata.confidence).toBeGreaterThan(0)
    expect(result.metadata.confidence).toBeLessThanOrEqual(1)
  })

  it('should return metadata with executionTimeMs', async () => {
    const task = makeTask()
    const result = await executor.execute(task)
    expect(result.metadata.executionTimeMs).toBeDefined()
    expect(result.metadata.executionTimeMs).toBeGreaterThanOrEqual(0)
  })

  it('should include task id in the analysis output', async () => {
    const task = makeTask({ id: 'custom-task-42' })
    const result = await executor.execute(task)
    expect(result.output.freeformAnalysis).toContain('custom-task-42')
  })

  it('should include blueprint role in the analysis output', async () => {
    const task = makeTask({
      blueprint: { role: 'security-expert', instructions: 'Review security' },
    })
    const result = await executor.execute(task)
    expect(result.output.freeformAnalysis).toContain('security-expert')
  })
})
