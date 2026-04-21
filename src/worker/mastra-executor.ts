// Mastra Agent execution adapter
// Wraps Mastra Agent.generate() for SwarmFlow task execution
// Supports both real Agent integration and fallback placeholder mode

import type { Task } from '../types/task.types.js'
import type { TaskResult, StructuredAgentOutput, ResultMetadata } from '../types/result.types.js'
import type { AgentBlueprint } from '../types/mission.types.js'

/**
 * Configuration for MastraExecutor.
 * When `agent` is provided, real LLM calls are made.
 * When omitted, the executor runs in placeholder/mock mode.
 */
export interface MastraExecutorConfig {
  /** A Mastra Agent instance (from @mastra/core). When provided, real LLM calls are made. */
  agent?: MastraAgentLike
  /** Maximum retries on transient failures (default: 2) */
  maxRetries?: number
  /** Delay between retries in ms (default: 1000) */
  retryDelayMs?: number
}

/**
 * Minimal interface for a Mastra Agent, so we don't hard-depend on @mastra/core at runtime.
 * Any object with a compatible `generate()` method will work.
 */
export interface MastraAgentLike {
  generate(
    messages: Array<{ role: string; content: string }>,
    options?: { output?: unknown }
  ): Promise<{ text?: string; object?: unknown; usage?: { totalTokens?: number; promptTokens?: number; completionTokens?: number } }>
}

/**
 * Token usage tracking across all executions.
 */
export interface TokenUsage {
  totalTokens: number
  promptTokens: number
  completionTokens: number
  callCount: number
}

export class MastraExecutor {
  private agent: MastraAgentLike | null
  private maxRetries: number
  private retryDelayMs: number
  private tokenUsage: TokenUsage = { totalTokens: 0, promptTokens: 0, completionTokens: 0, callCount: 0 }

  constructor(config: MastraExecutorConfig = {}) {
    this.agent = config.agent ?? null
    this.maxRetries = config.maxRetries ?? 2
    this.retryDelayMs = config.retryDelayMs ?? 1000
  }

  /**
   * Execute a SwarmFlow task.
   * If a real Mastra Agent is configured, calls agent.generate() with structured prompt.
   * Otherwise, falls back to placeholder mode (useful for testing and demos).
   */
  async execute(task: Task): Promise<TaskResult> {
    if (this.agent) {
      return this.executeWithAgent(task)
    }
    return this.executePlaceholder(task)
  }

  /**
   * Get cumulative token usage across all executions.
   */
  getTokenUsage(): TokenUsage {
    return { ...this.tokenUsage }
  }

  /**
   * Reset token usage counters.
   */
  resetTokenUsage(): void {
    this.tokenUsage = { totalTokens: 0, promptTokens: 0, completionTokens: 0, callCount: 0 }
  }

  // ─── Real Agent execution ─────────────────────────────────

  private async executeWithAgent(task: Task): Promise<TaskResult> {
    const startTime = Date.now()
    const messages = this.buildPromptMessages(task)

    let lastError: Error | null = null

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this.agent!.generate(messages)

        // Track token usage
        if (response.usage) {
          this.tokenUsage.totalTokens += response.usage.totalTokens ?? 0
          this.tokenUsage.promptTokens += response.usage.promptTokens ?? 0
          this.tokenUsage.completionTokens += response.usage.completionTokens ?? 0
        }
        this.tokenUsage.callCount++

        // Parse output
        const output = this.parseAgentOutput(response, task)
        const metadata = this.extractMetadata(output, startTime)

        return { output, metadata }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))

        // Don't retry on non-transient errors
        if (this.isNonTransientError(lastError)) {
          break
        }

        // Wait before retry (except on last attempt)
        if (attempt < this.maxRetries) {
          await sleep(this.retryDelayMs * (attempt + 1))
        }
      }
    }

    // All retries exhausted — return error result
    return this.buildErrorResult(task, lastError!, startTime)
  }

  // ─── Prompt construction ──────────────────────────────────

  /**
   * Build prompt messages for the Mastra Agent.
   * Structure: system instruction → task context → specific instructions
   */
  private buildPromptMessages(task: Task): Array<{ role: string; content: string }> {
    const systemPrompt = this.buildSystemPrompt(task.blueprint)
    const userPrompt = this.buildUserPrompt(task)

    return [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]
  }

  private buildSystemPrompt(blueprint: AgentBlueprint): string {
    const parts: string[] = [
      `You are an AI agent with the role: ${blueprint.role}.`,
      blueprint.instructions,
    ]

    if (blueprint.capabilities && blueprint.capabilities.length > 0) {
      parts.push(`Your capabilities: ${blueprint.capabilities.join(', ')}.`)
    }

    parts.push(
      '',
      'You must respond with a structured JSON output containing:',
      '- freeformAnalysis: Your detailed analysis (required)',
      '- score: A numeric score from 0 to 1 (optional)',
      '- stance: A numeric stance from -1 (strongly disagree) to 1 (strongly agree) (optional)',
      '- keyArguments: Array of {point, evidence, category} objects (optional)',
      '- tags: Array of relevant tags (optional)',
      '- wantsContinue: Whether you want to continue the discussion (true/false)',
      '- confidence: Your confidence level from 0 to 1',
    )

    return parts.join('\n')
  }

  private buildUserPrompt(task: Task): string {
    const parts: string[] = []

    // Task instructions
    parts.push(`## Task\n${task.instructions}`)

    // Task context
    if (task.context && Object.keys(task.context).length > 0) {
      parts.push(`\n## Context\n${JSON.stringify(task.context, null, 2)}`)
    }

    // Thread context (for interactive phases)
    if (task.threadId) {
      parts.push(`\n## Discussion Thread: ${task.threadId}`)
      parts.push('Please respond to the ongoing discussion, considering previous arguments.')
    }

    parts.push(
      '\n## Output Format',
      'Respond with valid JSON matching the structured output schema.',
    )

    return parts.join('\n')
  }

  // ─── Output parsing ───────────────────────────────────────

  private parseAgentOutput(
    response: { text?: string; object?: unknown },
    task: Task
  ): StructuredAgentOutput {
    // Prefer structured object output
    if (response.object && typeof response.object === 'object') {
      return this.normalizeOutput(response.object as Record<string, unknown>)
    }

    // Try to parse text as JSON
    if (response.text) {
      try {
        const parsed = JSON.parse(response.text)
        if (typeof parsed === 'object' && parsed !== null) {
          return this.normalizeOutput(parsed as Record<string, unknown>)
        }
      } catch {
        // Text is not JSON — wrap as freeform analysis
      }

      return {
        freeformAnalysis: response.text,
        score: undefined,
        stance: undefined,
      }
    }

    // Fallback
    return {
      freeformAnalysis: `No output from agent for task ${task.id}`,
    }
  }

  private normalizeOutput(raw: Record<string, unknown>): StructuredAgentOutput {
    return {
      ...raw,
      freeformAnalysis: typeof raw.freeformAnalysis === 'string'
        ? raw.freeformAnalysis
        : typeof raw.analysis === 'string'
          ? raw.analysis
          : JSON.stringify(raw),
      score: typeof raw.score === 'number' ? clamp(raw.score, 0, 1) : undefined,
      stance: typeof raw.stance === 'number' ? clamp(raw.stance, -1, 1) : undefined,
      tags: Array.isArray(raw.tags) ? raw.tags.filter((t): t is string => typeof t === 'string') : undefined,
      keyArguments: Array.isArray(raw.keyArguments) ? raw.keyArguments : undefined,
    }
  }

  private extractMetadata(output: StructuredAgentOutput, startTime: number): ResultMetadata {
    const raw = output as Record<string, unknown>
    return {
      wantsContinue: typeof raw.wantsContinue === 'boolean' ? raw.wantsContinue : false,
      continueReason: typeof raw.continueReason === 'string' ? raw.continueReason : undefined,
      confidence: typeof raw.confidence === 'number' ? clamp(raw.confidence as number, 0, 1) : 0.5,
      executionTimeMs: Date.now() - startTime,
      agentFramework: 'mastra' as const,
    }
  }

  // ─── Error handling ───────────────────────────────────────

  private isNonTransientError(error: Error): boolean {
    const message = error.message.toLowerCase()
    // Don't retry on auth errors, invalid requests, or content policy violations
    return (
      message.includes('authentication') ||
      message.includes('unauthorized') ||
      message.includes('invalid api key') ||
      message.includes('content policy') ||
      message.includes('content_filter')
    )
  }

  private buildErrorResult(task: Task, error: Error, startTime: number): TaskResult {
    return {
      output: {
        freeformAnalysis: `Agent execution failed for task ${task.id}: ${error.message}`,
        score: 0,
        stance: 0,
      },
      metadata: {
        wantsContinue: false,
        confidence: 0,
        executionTimeMs: Date.now() - startTime,
        agentFramework: 'mastra' as const,
        custom: { error: error.message, failed: true },
      },
    }
  }

  // ─── Placeholder mode (for testing / demos) ───────────────

  private async executePlaceholder(task: Task): Promise<TaskResult> {
    const startTime = Date.now()

    const output: StructuredAgentOutput = {
      freeformAnalysis: `Analysis for task ${task.id} by role ${task.blueprint.role}`,
      score: 0.75,
      stance: 0,
    }

    return {
      output,
      metadata: {
        wantsContinue: false,
        confidence: 0.8,
        executionTimeMs: Date.now() - startTime,
        agentFramework: 'mastra' as const,
      },
    }
  }
}

// ─── Utilities ────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
