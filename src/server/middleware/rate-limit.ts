// Rate limiting middleware using @fastify/rate-limit

import type { FastifyInstance } from 'fastify'
import rateLimit from '@fastify/rate-limit'

export interface RateLimitConfig {
  max?: number          // max requests per window (default: 100)
  timeWindow?: string   // time window (default: '1 minute')
}

export async function registerRateLimit(
  app: FastifyInstance,
  config: RateLimitConfig = {}
): Promise<void> {
  await app.register(rateLimit, {
    max: config.max ?? 100,
    timeWindow: config.timeWindow ?? '1 minute',
  })
}
