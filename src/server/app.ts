// Fastify application setup
// HTTP server for TaskBoard and Mission APIs

import Fastify from 'fastify'
import type { FastifyInstance } from 'fastify'
import { registerAuth } from './middleware/auth.js'
import type { AuthConfig } from './middleware/auth.js'
import { registerRateLimit } from './middleware/rate-limit.js'
import type { RateLimitConfig } from './middleware/rate-limit.js'
import { registerMissionRoutes } from './routes/mission.routes.js'
import { registerTaskRoutes } from './routes/task.routes.js'
import { MissionManager } from '../core/mission-manager.js'
import { TaskBoard } from '../core/task-board.js'

export interface AppConfig {
  auth?: AuthConfig
  rateLimit?: RateLimitConfig
  logger?: boolean
}

export interface AppDependencies {
  missionManager: MissionManager
  taskBoard: TaskBoard
}

export async function createApp(
  config: AppConfig = {},
  deps?: AppDependencies
): Promise<FastifyInstance> {
  const app = Fastify({ logger: config.logger ?? true })

  // Register rate limiting
  await registerRateLimit(app, config.rateLimit)

  // Register auth middleware (if token provided)
  if (config.auth?.token) {
    registerAuth(app, config.auth)
  }

  // Health check (always available, no auth)
  app.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() }
  })

  // Register API routes
  const missionManager = deps?.missionManager ?? new MissionManager()
  const taskBoard = deps?.taskBoard ?? new TaskBoard()

  registerMissionRoutes(app, missionManager)
  registerTaskRoutes(app, taskBoard)

  // Global error handler
  app.setErrorHandler((error, _request, reply) => {
    app.log.error(error)
    const statusCode = (error as { statusCode?: number }).statusCode ?? 500
    const message = error instanceof Error ? error.message : 'Internal Server Error'
    reply.code(statusCode).send({ error: message })
  })

  return app
}

export type { FastifyInstance }
