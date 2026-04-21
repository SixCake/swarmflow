# SwarmFlow

[![Build Status](https://github.com/swarmflow/swarmflow/workflows/CI/badge.svg)](https://github.com/swarmflow/swarmflow/actions)
[![npm version](https://badge.fury.io/js/swarm-flow.svg)](https://badge.fury.io/js/swarm-flow)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Distributed AI Agent task orchestration framework, powered by Mastra**

SwarmFlow is an open-source distributed AI Agent task orchestration framework built on top of Mastra's Agent definition and execution capabilities. It enables large-scale AI Agent collaboration through dynamic DAG orchestration, hybrid hub architecture, and autonomous decision-making at the terminal level.

## Core Features

- **Pure AI Agent Execution** - All task execution is driven by AI Agents, no manual intervention
- **Dynamic DAG Orchestration** - Automatically constructs and adjusts execution graphs based on task dependencies
- **Hyper-Scale Support** - Designed for millions of concurrent agents and tasks
- **Hybrid Hub Architecture** - Combines centralized coordination with decentralized execution
- **No Long-Running Connections** - Stateless design enables horizontal scaling without WebSocket overhead
- **Terminal Autonomous Decision** - Agents make execution decisions independently at the edge
- **Mastra Native** - Built on Mastra's powerful Agent framework for seamless integration

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Mission Layer                           │
│  (Mission Definition, Agent Blueprint, Convergence Rules)   │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    Orchestration Layer                       │
│  (DAG Engine, Task Board, Schema Validator, Convergence)    │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                     Execution Layer                          │
│  (Worker Pool, Mastra Executor, Storage, Checkpointing)     │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start

### Installation

```bash
npm install swarm-flow
```

### Basic Example

Create a mission with 3 Mastra Agents debating a topic:

```typescript
import { SwarmFlow } from 'swarm-flow';
import { Agent } from '@mastra/core';

// Define 3 Mastra Agents
const moderatorAgent = new Agent({
  name: 'moderator',
  instructions: 'You are the moderator. Guide the debate and ensure all viewpoints are heard.'
});

const proponentAgent = new Agent({
  name: 'proponent',
  instructions: 'You argue in favor of the proposition with strong evidence.'
});

const opponentAgent = new Agent({
  name: 'opponent',
  instructions: 'You argue against the proposition with counterarguments.'
});

// Create SwarmFlow instance
const swarmFlow = new SwarmFlow();

// Define mission
const mission = await swarmFlow.createMission({
  name: 'AI Safety Debate',
  topic: 'Should AI development be regulated?',
  agents: [
    moderatorAgent,
    proponentAgent,
    opponentAgent
  ],
  convergenceRules: {
    maxRounds: 5,
    consensusThreshold: 0.8
  }
});

// Execute mission
const result = await swarmFlow.executeMission(mission.id);

console.log('Debate Result:', result);
```

## Documentation

- [Design Document](docs/swarm-flow-design.md) - Architecture and design decisions
- [MVP Roadmap](docs/swarm-flow-mvp.md) - Minimum viable product features

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Code of Conduct

Please read and follow our [Code of Conduct](CODE_OF_CONDUCT.md).
