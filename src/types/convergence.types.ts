// From design doc Section 3.7

import type { InteractionThread } from './thread.types.js'

export interface ConvergencePolicy {
  shouldThreadContinue(thread: InteractionThread): boolean
  isPhaseComplete(threads: InteractionThread[]): boolean
}
