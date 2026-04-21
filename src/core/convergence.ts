// Convergence strategies
// 3 built-in strategies: mutualIntent, bothAgree, fixedRounds

import type { ConvergencePolicy } from '../types/convergence.types.js'
import type { InteractionThread } from '../types/thread.types.js'

const MAX_ROUNDS = 3

export const mutualIntent: ConvergencePolicy = {
  shouldThreadContinue(thread: InteractionThread): boolean {
    const latestRound = thread.rounds[thread.rounds.length - 1]
    if (!latestRound || thread.rounds.length >= MAX_ROUNDS) return false
    return latestRound.results.some(r => r.metadata.wantsContinue)
  },
  isPhaseComplete(threads: InteractionThread[]): boolean {
    return threads.every(t => t.status === 'converged')
  },
}

export const bothAgree: ConvergencePolicy = {
  shouldThreadContinue(thread: InteractionThread): boolean {
    const latestRound = thread.rounds[thread.rounds.length - 1]
    if (!latestRound || thread.rounds.length >= MAX_ROUNDS) return false
    return latestRound.results.every(r => r.metadata.wantsContinue)
  },
  isPhaseComplete(threads: InteractionThread[]): boolean {
    return threads.every(t => t.status === 'converged')
  },
}

export const fixedRounds = (maxRounds: number): ConvergencePolicy => ({
  shouldThreadContinue(thread: InteractionThread): boolean {
    return thread.rounds.length < maxRounds
  },
  isPhaseComplete(threads: InteractionThread[]): boolean {
    return threads.every(t => t.status === 'converged')
  },
})
