# Quick Start — 3 Agent Debate

A minimal SwarmFlow example demonstrating three AI agents debating a topic through structured phases.

## What This Example Does

1. **Opening Statements** (Parallel Phase) — Each agent independently shares their initial position
2. **Debate Rounds** (Interactive Phase) — Agents respond to each other's arguments with convergence detection
3. **Closing Statements** (Aggregate Phase) — Each agent provides their final stance

## Agents

| Role | Position | Capabilities |
|------|----------|-------------|
| **Proponent** | Argues in favor of AI regulation | debate, analysis |
| **Opponent** | Argues against AI regulation | debate, analysis |
| **Moderator** | Neutral facilitator, summarizes key points | moderate, synthesis |

## Running

```bash
# From the repository root
npx tsx examples/quick-start/index.ts
```

## Key Concepts Demonstrated

- **Mission** definition with goal, context, and agent blueprints
- **Phase orchestration** — parallel → interactive → aggregate
- **TaskBoard** lifecycle — publish → claim → submit → verify
- **Convergence detection** using `mutualIntent` policy
- **AggregationDigest** for zero-token result summarization

## Architecture

```
Mission
├── Phase 1: Opening Statements (parallel)
│   ├── Task: proponent opening
│   ├── Task: opponent opening
│   └── Task: moderator opening
├── Phase 2: Debate Rounds (interactive)
│   ├── Round 1: all agents respond
│   ├── Round 2: all agents respond
│   └── ... (until convergence)
└── Phase 3: Closing Statements (aggregate)
    ├── Task: proponent closing
    ├── Task: opponent closing
    └── Task: moderator closing
```
