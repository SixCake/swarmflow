// Fastify application setup
// HTTP server for TaskBoard and Mission APIs

import Fastify from 'fastify'
import type { FastifyInstance } from 'fastify'
import { registerAuth, TerminalRegistry } from './middleware/auth.js'
import type { AuthConfig } from './middleware/auth.js'
import { registerRateLimit } from './middleware/rate-limit.js'
import type { RateLimitConfig } from './middleware/rate-limit.js'
import { registerMissionRoutes } from './routes/mission.routes.js'
import { registerTaskRoutes } from './routes/task.routes.js'
import { registerTerminalRoutes } from './routes/terminal.routes.js'
import { registerCommentRoutes } from './routes/comment.routes.js'
import { registerThreadRoutes } from './routes/thread.routes.js'
import { registerDashboardRoutes } from './routes/dashboard.routes.js'
import type { DashboardAuthConfig } from './middleware/dashboard-auth.js'
import { MissionManager } from '../core/mission-manager.js'
import { TaskBoard } from '../core/task-board.js'
import { DAGEngine } from '../core/dag-engine.js'
import { CommentBoard } from '../core/comment-board.js'

export interface AppConfig {
  auth?: AuthConfig
  rateLimit?: RateLimitConfig
  logger?: boolean
  /** Dashboard admin credentials — if omitted, dashboard is disabled */
  dashboardAuth?: DashboardAuthConfig
}

export interface AppDependencies {
  missionManager: MissionManager
  taskBoard: TaskBoard
  terminalRegistry?: TerminalRegistry
  dagEngine?: DAGEngine
  commentBoard?: CommentBoard
}

export async function createApp(
  config: AppConfig = {},
  deps?: AppDependencies
): Promise<FastifyInstance> {
  const app = Fastify({ logger: config.logger ?? true })

  // Register rate limiting
  await registerRateLimit(app, config.rateLimit)

  // Instantiate dependencies
  const missionManager = deps?.missionManager ?? new MissionManager()
  const taskBoard = deps?.taskBoard ?? new TaskBoard()
  const terminalRegistry = deps?.terminalRegistry ?? new TerminalRegistry()
  const dagEngine = deps?.dagEngine ?? new DAGEngine(taskBoard)
  const commentBoard = deps?.commentBoard ?? new CommentBoard()

  // Register auth middleware (if token provided) — with terminal registry for dual-mode auth
  if (config.auth?.token) {
    const dashboardExcludes = ['/health', '/dashboard']
    const existingExcludes = config.auth.excludePaths ?? []
    registerAuth(app, {
      ...config.auth,
      excludePaths: [...new Set([...existingExcludes, ...dashboardExcludes])],
    }, terminalRegistry)
  }

  // Health check (always available, no auth)
  app.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() }
  })

  // Register API routes
  registerMissionRoutes(app, missionManager)
  registerTaskRoutes(app, taskBoard)
  registerTerminalRoutes(app, terminalRegistry)
  registerCommentRoutes(app, commentBoard)
  registerThreadRoutes(app, dagEngine)
  registerDashboardRoutes(app, missionManager, taskBoard, terminalRegistry, dagEngine, config.dashboardAuth)

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
