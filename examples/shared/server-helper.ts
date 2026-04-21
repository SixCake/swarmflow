/**
 * SwarmFlow Server Helper
 *
 * Shared utility for starting/stopping the Fastify server in examples.
 * Each example starts its own server instance, runs the demo, then shuts down.
 */

import { createApp } from '../../src/server/app.js'
import type { AppConfig, AppDependencies } from '../../src/server/app.js'
import type { FastifyInstance } from 'fastify'

export interface ServerInstance {
  app: FastifyInstance
  baseUrl: string
  close: () => Promise<void>
}

export async function startServer(
  config?: {
    port?: number
    appConfig?: AppConfig
    deps?: AppDependencies
  }
): Promise<ServerInstance> {
  const port = config?.port ?? 3210
  const appConfig: AppConfig = {
    logger: false,  // Suppress Fastify logs in demo output
    ...config?.appConfig,
  }

  const app = await createApp(appConfig, config?.deps)

  await app.listen({ port, host: '127.0.0.1' })
  const baseUrl = `http://127.0.0.1:${port}`

  return {
    app,
    baseUrl,
    close: async () => {
      await app.close()
    },
  }
}
