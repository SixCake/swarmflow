// Dashboard route — serves the embedded management UI
// All dashboard endpoints are under /dashboard* so auth can exclude them by prefix

import type { FastifyInstance } from 'fastify'
import type { MissionManager } from '../../core/mission-manager.js'
import type { TaskBoard } from '../../core/task-board.js'
import type { TerminalRegistry } from '../middleware/auth.js'
import type { DAGEngine } from '../../core/dag-engine.js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

function loadDashboardHtml(): string {
  const currentDir = dirname(fileURLToPath(import.meta.url))
  const htmlPath = resolve(currentDir, '..', 'dashboard.html')
  return readFileSync(htmlPath, 'utf-8')
}

export function registerDashboardRoutes(
  app: FastifyInstance,
  missionManager: MissionManager,
  taskBoard: TaskBoard,
  terminalRegistry: TerminalRegistry,
  dagEngine: DAGEngine
): void {
  let cachedHtml: string | null = null

  // Serve the dashboard HTML page
  app.get('/dashboard', async (_request, reply) => {
    if (!cachedHtml) {
      cachedHtml = loadDashboardHtml()
    }
    reply.type('text/html').send(cachedHtml)
  })

  // Dashboard data APIs — all under /dashboard/api/*
  app.get('/dashboard/api/missions', async (_request, reply) => {
    const missions = missionManager.listMissions()
    reply.send(missions)
  })

  app.get('/dashboard/api/tasks', async (_request, reply) => {
    const tasks = taskBoard.listAll()
    reply.send(tasks)
  })

  app.get('/dashboard/api/terminals', async (_request, reply) => {
    const terminals = terminalRegistry.listAll()
    reply.send(terminals)
  })

  app.get('/dashboard/api/threads', async (_request, reply) => {
    const threads = dagEngine.getAllThreads()
    reply.send(threads.map(thread => ({
      id: thread.id,
      missionId: thread.missionId,
      postTaskId: thread.postTaskId,
      postAuthor: thread.postAuthor,
      participants: thread.participants,
      rounds: thread.rounds,
      status: thread.status,
    })))
  })
}
