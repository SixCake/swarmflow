# SwarmFlow

[![Build Status](https://github.com/swarmflow/swarmflow/workflows/CI/badge.svg)](https://github.com/swarmflow/swarmflow/actions)
[![npm version](https://badge.fury.io/js/swarm-flow.svg)](https://badge.fury.io/js/swarm-flow)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Distributed AI Agent task orchestration framework, powered by Mastra**

SwarmFlow is an open-source distributed AI Agent task orchestration framework built on top of Mastra's Agent definition and execution capabilities. It enables large-scale AI Agent collaboration through dynamic DAG orchestration, hybrid hub architecture, and autonomous decision-making at the terminal level.

## Core Features

- **Pure AI Agent Execution** — All task execution is driven by AI Agents, no manual intervention
- **Dynamic DAG Orchestration** — Automatically constructs and adjusts execution graphs based on task dependencies
- **Multi-Phase Workflow** — Supports parallel, interactive (debate), and aggregate phases
- **6 Convergence Strategies** — mutualIntent, bothAgree, fixedRounds, consensus, stability, hybrid + custom
- **Aggregation Engine** — Stance clustering (Jaccard + hierarchical), conflict analysis, guidance signals, layered reports
- **Built-in Dashboard** — Embedded web UI for real-time system monitoring and management, with login authentication and brute-force protection
- **Security Hardening** — Context sanitization, prompt injection detection, anti-poisoning, audit logging
- **Hybrid Hub Architecture** — Combines centralized coordination with decentralized execution
- **No Long-Running Connections** — Stateless REST API enables horizontal scaling
- **Mastra Native** — Built on Mastra's powerful Agent framework for seamless integration

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Mission Layer                           │
│  Mission Definition · Agent Blueprint · Convergence Rules   │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    Orchestration Layer                       │
│  DAG Engine · Task Board · Schema Validator · Convergence   │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                     Execution Layer                          │
│  Worker Pool · Mastra Executor · Storage · Security         │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    Management Layer                          │
│  Dashboard UI · Login Auth · Rate Limiting · Session Mgmt   │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start

### Installation

```bash
npm install swarm-flow
```

### Basic Usage (Programmatic API)

```typescript
import { SwarmFlow } from 'swarm-flow'
import type { Mission } from 'swarm-flow'

const swarm = new SwarmFlow({ port: 3100 })

const mission: Mission = {
  id: 'debate-1',
  goal: 'Evaluate whether AI development should be regulated',
  agentBlueprints: [
    { role: 'proponent', instructions: 'Argue in favor of regulation' },
    { role: 'opponent', instructions: 'Argue against regulation' },
    { role: 'moderator', instructions: 'Synthesize both viewpoints' },
  ],
  phases: [
    { id: 'phase-1', type: 'parallel', blueprintRoles: ['proponent', 'opponent', 'moderator'], transitionRule: { type: 'all_completed' } },
    { id: 'phase-2', type: 'interactive', blueprintRoles: ['proponent', 'opponent'], transitionRule: { type: 'convergence' } },
    { id: 'phase-3', type: 'aggregate', blueprintRoles: ['moderator'], transitionRule: { type: 'all_completed' } },
  ],
  convergencePolicy: { strategy: 'consensus', maxRounds: 5, consensusThreshold: 0.8 },
}

// Start mission (launches server + workers)
const record = await swarm.start(mission)

// Run orchestration loop
await swarm.run(record.id)

// Stop everything
await swarm.stop()
```

### REST API Usage

SwarmFlow exposes a full REST API for mission and task management:

```bash
# Create a mission
curl -X POST http://localhost:3100/missions \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"id":"m1","goal":"Evaluate AI regulation","agentBlueprints":[...],"phases":[...]}'

# List available tasks
curl http://localhost:3100/tasks/available \
  -H "Authorization: Bearer <token>"

# Claim a task
curl -X POST http://localhost:3100/tasks/task-1/claim \
  -H "Authorization: Bearer <token>" \
  -d '{"workerId":"worker-1"}'

# Submit result
curl -X POST http://localhost:3100/tasks/task-1/submit \
  -H "Authorization: Bearer <token>" \
  -d '{"output":{...},"metadata":{...}}'
```

## API Reference

### Core Classes

| Class | Description |
|-------|-------------|
| `SwarmFlow` | Main orchestration class — start, run, stop missions |
| `MissionManager` | Mission CRUD + status machine (created → running → completed) |
| `TaskBoard` | Task state machine with atomic CAS claim, heartbeat, expiry |
| `DAGEngine` | Phase orchestration — parallel, interactive, aggregate |
| `SchemaValidator` | JSON Schema → Zod validation with caching |

### Convergence Strategies

| Strategy | Description |
|----------|-------------|
| `mutualIntent` | Both agents signal willingness to stop |
| `bothAgree` | Both agents share the same stance |
| `fixedRounds` | Fixed number of interaction rounds |
| `consensus` | Dominant stance fraction exceeds threshold |
| `stability` | Stance distribution change rate below threshold |
| `hybrid` | Combines consensus + stability |

### Aggregation Engine

| Function | Description |
|----------|-------------|
| `buildDigest()` | Full aggregation: statistics + clustering + conflicts + guidance |
| `generateReport()` | Layered report generation (5 layers, no LLM) |
| `renderReportMarkdown()` | Render report as Markdown |

### Dashboard

| Route | Description |
|-------|-------------|
| `GET /dashboard` | Dashboard web UI (requires login) |
| `GET /dashboard/login` | Login page |
| `POST /dashboard/login` | Authenticate (username + password) |
| `POST /dashboard/logout` | Destroy session |
| `GET /dashboard/api/*` | Dashboard data APIs (requires session) |

### Security Modules

| Module | Description |
|--------|-------------|
| `dashboard-auth` | Dashboard login with scrypt hashing, session cookies, IP rate limiting, brute-force lockout |
| `context-security` | PII removal, API key redaction, Unicode watermarking |
| `prompt-defense` | Injection detection, instruction isolation, output safety |
| `anti-poisoning` | Stance outliers, Sybil detection, cross-validation |
| `audit` | Full audit logging with event sourcing and alerting |

### Storage

| Provider | Description |
|----------|-------------|
| `MemoryStorage` | In-memory (default, for development) |
| `FileStorage` | JSON file persistence (for small deployments) |

## Dashboard

SwarmFlow includes a built-in web dashboard for real-time system monitoring and management. Access it at `http://localhost:<port>/dashboard` after starting the server.

### Features

- **System Overview** — Key metrics (missions, tasks, terminals, threads), task pipeline visualization, recent activity
- **Mission Management** — View all missions with status, phases, agents, and convergence policy
- **Task Monitoring** — Real-time task lifecycle tracking (published → claimed → submitted → verified), failure detection
- **Terminal Management** — Registered worker terminals, active status, capabilities
- **Thread & Discussion** — Interactive discussion threads, round progress, convergence status

### Authentication & Security

The dashboard requires username/password authentication with built-in brute-force protection:

- **Password hashing** — `crypto.scrypt` (N=16384, 32-byte salt, 64-byte key) with timing-safe comparison
- **Session management** — Cryptographically random tokens, HttpOnly + SameSite=Strict cookies, configurable TTL
- **IP rate limiting** — Sliding window (default: 5 attempts per 60 seconds)
- **IP lockout** — Automatic lockout after exceeding max attempts (default: 5 minutes)
- **Zero extra dependencies** — Uses only Node.js built-in `crypto` module

### Dashboard Configuration

```typescript
const swarm = new SwarmFlow({
  port: 3100,
  authToken: 'my-secret-token',
  dashboardAuth: {
    username: 'admin',                // Dashboard login username
    password: 'your-secure-password', // Dashboard login password
    sessionTtlSeconds: 14400,         // Session duration (default: 4 hours)
    maxLoginAttempts: 5,              // Max attempts per IP per window
    rateLimitWindowSeconds: 60,       // Rate limit window
    lockoutDurationSeconds: 300,      // IP lockout duration (default: 5 min)
  },
})
```

Or via environment variables:

```bash
SWARMFLOW_DASH_USER=admin
SWARMFLOW_DASH_PASS=your-secure-password
```

> **Note:** If `dashboardAuth` is not provided, the dashboard endpoint returns `503 Service Unavailable`.

## Configuration

```typescript
const swarm = new SwarmFlow({
  port: 3100,                    // HTTP server port
  authToken: 'my-secret-token',  // Bearer token for API auth
  dashboardAuth: {               // Dashboard admin credentials (optional)
    username: 'admin',
    password: 'your-secure-password',
  },
})
```

## Examples

See the [examples/](examples/) directory for complete working examples:

- **[quick-start](examples/quick-start/)** — Minimal 3-agent debate via REST API
- **[code-review](examples/code-review/)** — Multi-agent code review workflow
- **[product-evaluation](examples/product-evaluation/)** — Product evaluation with convergence

## Documentation

- [Design Document](docs/swarm-flow-design.md) — Architecture and design decisions
- [Implementation Guide](docs/swarm-flow-design-implementation.md) — Detailed implementation plan
- [MVP Roadmap](docs/swarm-flow-mvp.md) — Minimum viable product features

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

## Code of Conduct

Please read and follow our [Code of Conduct](CODE_OF_CONDUCT.md).
