import { describe, it, expect, beforeEach, vi } from 'vitest'
import { MastraExecutor } from '../../src/worker/mastra-executor.js'
import type { MastraAgentLike } from '../../src/worker/mastra-executor.js'
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

function makeMockAgent(response: Partial<Awaited<ReturnType<MastraAgentLike['generate']>>> = {}): MastraAgentLike {
  return {
    generate: vi.fn().mockResolvedValue({
      text: JSON.stringify({
        freeformAnalysis: 'Mock analysis result',
        score: 0.85,
        stance: 0.5,
        wantsContinue: true,
        confidence: 0.9,
      }),
      usage: { totalTokens: 150, promptTokens: 100, completionTokens: 50 },
      ...response,
    }),
  }
}

describe('MastraExecutor', () => {
  describe('placeholder mode (no agent)', () => {
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
      expect(result.metadata.confidence).toBeGreaterThan(0)
      expect(result.metadata.confidence).toBeLessThanOrEqual(1)
    })

    it('should return metadata with executionTimeMs', async () => {
      const task = makeTask()
      const result = await executor.execute(task)
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

  describe('real agent mode', () => {
    it('should call agent.generate() with system and user messages', async () => {
      const agent = makeMockAgent()
      const executor = new MastraExecutor({ agent })
      const task = makeTask()

      await executor.execute(task)

      expect(agent.generate).toHaveBeenCalledTimes(1)
      const messages = (agent.generate as ReturnType<typeof vi.fn>).mock.calls[0][0]
      expect(messages).toHaveLength(2)
      expect(messages[0].role).toBe('system')
      expect(messages[1].role).toBe('user')
    })

    it('should include role in system prompt', async () => {
      const agent = makeMockAgent()
      const executor = new MastraExecutor({ agent })
      const task = makeTask({ blueprint: { role: 'data-scientist', instructions: 'Analyze data', capabilities: ['ml'] } })

      await executor.execute(task)

      const messages = (agent.generate as ReturnType<typeof vi.fn>).mock.calls[0][0]
      expect(messages[0].content).toContain('data-scientist')
      expect(messages[0].content).toContain('Analyze data')
      expect(messages[0].content).toContain('ml')
    })

    it('should include task instructions and context in user prompt', async () => {
      const agent = makeMockAgent()
      const executor = new MastraExecutor({ agent })
      const task = makeTask({ instructions: 'Evaluate AI safety', context: { topic: 'Safety' } })

      await executor.execute(task)

      const messages = (agent.generate as ReturnType<typeof vi.fn>).mock.calls[0][0]
      expect(messages[1].content).toContain('Evaluate AI safety')
      expect(messages[1].content).toContain('Safety')
    })

    it('should include threadId context for interactive tasks', async () => {
      const agent = makeMockAgent()
      const executor = new MastraExecutor({ agent })
      const task = makeTask({ threadId: 'thread-debate-1' })

      await executor.execute(task)

      const messages = (agent.generate as ReturnType<typeof vi.fn>).mock.calls[0][0]
      expect(messages[1].content).toContain('thread-debate-1')
    })

    it('should parse structured JSON output from agent', async () => {
      const agent = makeMockAgent({
        text: JSON.stringify({
          freeformAnalysis: 'Deep analysis of AI regulation',
          score: 0.92,
          stance: -0.3,
          wantsContinue: true,
          confidence: 0.88,
          tags: ['regulation', 'safety'],
        }),
      })
      const executor = new MastraExecutor({ agent })
      const result = await executor.execute(makeTask())

      expect(result.output.freeformAnalysis).toBe('Deep analysis of AI regulation')
      expect(result.output.score).toBe(0.92)
      expect(result.output.stance).toBe(-0.3)
      expect(result.output.tags).toEqual(['regulation', 'safety'])
      expect(result.metadata.wantsContinue).toBe(true)
      expect(result.metadata.confidence).toBe(0.88)
    })

    it('should prefer object output over text', async () => {
      const agent = makeMockAgent({
        object: { freeformAnalysis: 'From object', score: 0.99 },
        text: JSON.stringify({ freeformAnalysis: 'From text', score: 0.1 }),
      })
      const executor = new MastraExecutor({ agent })
      const result = await executor.execute(makeTask())

      expect(result.output.freeformAnalysis).toBe('From object')
      expect(result.output.score).toBe(0.99)
    })

    it('should handle plain text (non-JSON) output', async () => {
      const agent = makeMockAgent({ text: 'Just a plain text response', object: undefined })
      const executor = new MastraExecutor({ agent })
      const result = await executor.execute(makeTask())

      expect(result.output.freeformAnalysis).toBe('Just a plain text response')
    })

    it('should clamp score to [0, 1] and stance to [-1, 1]', async () => {
      const agent = makeMockAgent({
        text: JSON.stringify({ freeformAnalysis: 'test', score: 5.0, stance: -10 }),
      })
      const executor = new MastraExecutor({ agent })
      const result = await executor.execute(makeTask())

      expect(result.output.score).toBe(1)
      expect(result.output.stance).toBe(-1)
    })
  })

  describe('error handling and retries', () => {
    it('should retry on transient errors', async () => {
      let callCount = 0
      const agent: MastraAgentLike = {
        generate: vi.fn().mockImplementation(async () => {
          callCount++
          if (callCount < 3) throw new Error('Network timeout')
          return { text: JSON.stringify({ freeformAnalysis: 'Success after retry' }) }
        }),
      }
      const executor = new MastraExecutor({ agent, maxRetries: 2, retryDelayMs: 10 })
      const result = await executor.execute(makeTask())

      expect(result.output.freeformAnalysis).toBe('Success after retry')
      expect(callCount).toBe(3)
    })

    it('should not retry on auth errors', async () => {
      const agent: MastraAgentLike = {
        generate: vi.fn().mockRejectedValue(new Error('Invalid API key')),
      }
      const executor = new MastraExecutor({ agent, maxRetries: 3, retryDelayMs: 10 })
      const result = await executor.execute(makeTask())

      expect(agent.generate).toHaveBeenCalledTimes(1)
      expect(result.metadata.confidence).toBe(0)
      expect(result.metadata.custom?.failed).toBe(true)
    })

    it('should return error result after all retries exhausted', async () => {
      const agent: MastraAgentLike = {
        generate: vi.fn().mockRejectedValue(new Error('Server error')),
      }
      const executor = new MastraExecutor({ agent, maxRetries: 1, retryDelayMs: 10 })
      const result = await executor.execute(makeTask())

      expect(agent.generate).toHaveBeenCalledTimes(2) // 1 initial + 1 retry
      expect(result.output.freeformAnalysis).toContain('Agent execution failed')
      expect(result.output.freeformAnalysis).toContain('Server error')
      expect(result.metadata.confidence).toBe(0)
    })
  })

  describe('token usage tracking', () => {
    it('should track token usage across executions', async () => {
      const agent = makeMockAgent({
        usage: { totalTokens: 200, promptTokens: 150, completionTokens: 50 },
      })
      const executor = new MastraExecutor({ agent })

      await executor.execute(makeTask())
      await executor.execute(makeTask())

      const usage = executor.getTokenUsage()
      expect(usage.totalTokens).toBe(400)
      expect(usage.promptTokens).toBe(300)
      expect(usage.completionTokens).toBe(100)
      expect(usage.callCount).toBe(2)
    })

    it('should reset token usage', async () => {
      const agent = makeMockAgent()
      const executor = new MastraExecutor({ agent })

      await executor.execute(makeTask())
      executor.resetTokenUsage()

      const usage = executor.getTokenUsage()
      expect(usage.totalTokens).toBe(0)
      expect(usage.callCount).toBe(0)
    })

    it('should return zero usage in placeholder mode', () => {
      const executor = new MastraExecutor()
      const usage = executor.getTokenUsage()
      expect(usage.totalTokens).toBe(0)
      expect(usage.callCount).toBe(0)
    })
  })
})
