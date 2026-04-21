// Standalone SwarmFlow server — starts HTTP server with a demo mission
// and keeps running for external agents to connect via Skill

import { SwarmFlow } from '../src/swarm-flow.js'
import type { Mission } from '../src/types/mission.types.js'

const PORT = Number(process.env.SWARMFLOW_PORT ?? 3100)

const swarm = new SwarmFlow({
  port: PORT,
  authToken: process.env.SWARMFLOW_AUTH_TOKEN ?? 'test-token',
  logger: true,
})

const mission: Mission = {
  id: 'debate-ai-regulation',
  goal: 'Evaluate whether AI development should be regulated',
  context: {
    topic: 'AI Regulation',
    background: 'Rapid AI advancement raises questions about safety, ethics, and governance.',
  },
  blueprints: [
    { role: 'proponent', instructions: 'Argue in favor of AI regulation with evidence and reasoning', capabilities: ['debate', 'analysis'] },
    { role: 'opponent', instructions: 'Argue against AI regulation with evidence and reasoning', capabilities: ['debate', 'analysis'] },
    { role: 'moderator', instructions: 'Synthesize both viewpoints into a balanced conclusion', capabilities: ['moderate', 'synthesis'] },
  ],
  phases: [
    {
      id: 'opening-statements',
      type: 'parallel',
      taskTemplate: { type: 'independent_opinion', instructionTemplate: 'Share your opening statement on AI regulation.', expectedOutputSchema: {} },
      transitionRule: { type: 'all_completed' },
    },
    {
      id: 'debate-rounds',
      type: 'interactive',
      taskTemplate: { type: 'comment', instructionTemplate: 'Respond to other viewpoints based on the digest.', expectedOutputSchema: {} },
      transitionRule: { type: 'convergence' },
    },
    {
      id: 'closing-statements',
      type: 'aggregate',
      taskTemplate: { type: 'final_stance', instructionTemplate: 'Provide your final stance considering all arguments.', expectedOutputSchema: {} },
      transitionRule: { type: 'all_completed' },
    },
  ],
  convergencePolicy: 'mutualIntent',
  config: {
    maxConcurrentTasks: 10,
    taskTimeoutMinutes: 5,
    maxRetries: 2,
    claimExpiryMinutes: 2,
  },
}

console.log(`\n🐝 SwarmFlow Server starting on port ${PORT}...`)
console.log(`   Auth token: test-token\n`)

const record = await swarm.start(mission)

console.log(`✅ Mission created: ${record.id}`)
console.log(`   Status: ${record.status}`)
console.log(`\n📡 Server running at http://127.0.0.1:${PORT}`)
console.log(`   Health:    GET  http://127.0.0.1:${PORT}/health`)
console.log(`   Tasks:     GET  http://127.0.0.1:${PORT}/tasks/available`)
console.log(`   Missions:  GET  http://127.0.0.1:${PORT}/missions`)
console.log(`\n⏳ Waiting for external agents to connect...\n`)
console.log(`   Press Ctrl+C to stop.\n`)

// Keep process alive
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down...')
  await swarm.stop()
  process.exit(0)
})
