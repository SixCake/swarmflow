# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-04-21

### Added

#### Core Orchestration Engine (Phase 5)
- DAGEngine: full phase orchestration with parallel, interactive, aggregate phase types
- DAGEngine: automatic task generation, thread creation, convergence-driven loops
- SwarmFlow: `start()`, `run()`, `startAndRun()`, `waitForCompletion()`, `stop()` lifecycle
- MissionManager: state machine validation (created → running → completed/failed/cancelled)
- MissionManager: semantic methods (`startMission`, `completeMission`, `failMission`, `cancelMission`)

#### Advanced Convergence Strategies (Phase 6)
- `consensus` strategy: stance-majority threshold convergence
- `stability` strategy: stance distribution change-rate convergence
- `hybrid` strategy: combined consensus + stability
- Configurable `maxRounds` for all strategies
- Custom strategy registration via `registerConvergenceStrategy()`

#### Aggregation Engine (Phase 7)
- Stance clustering: Jaccard similarity + single-linkage hierarchical clustering
- Conflict analysis: opposing cluster detection with divergence strength
- Guidance signals: devil_advocate, focus_topic, clarify, deepen suggestions
- Layered report generation (5 layers, zero LLM) with Markdown rendering
- Enhanced `buildDigest()` returning keyInsights, conflicts, guidanceSuggestions

#### Real Agent Integration (Phase 8)
- MastraExecutor: real `Agent.generate()` calls with placeholder fallback
- Prompt construction: system instructions + task context + structured output
- Output parsing with confidence/stance normalization
- Error handling with configurable retry logic
- Token usage tracking (prompt, completion, total, call count)
- WorkerThread: Poll → Claim → Execute → Submit loop
- Concurrent task limiting (maxConcurrentTasks)
- Heartbeat mechanism for claim extension

#### TaskBoard Enhancement (Phase 9)
- Expired task handling: `handleExpiredTasks()` auto-resets timed-out claims
- Heartbeat: `heartbeat(taskId)` extends claim validity
- Atomic CAS claim: version-based optimistic locking
- maxRetry enforcement: tasks marked cancelled after exceeding limit
- Event system: publish/claim/submit/verify/reject/expired/failed notifications

#### Security Hardening (Phase 9)
- Terminal registry: registration, authentication, API key rotation, per-identity limits
- Context security: PII removal, API key redaction, IP sanitization, Unicode watermarking
- Prompt defense: injection detection (14 patterns), instruction isolation, output safety checks
- Anti-poisoning: stance/confidence outlier detection, rapid flip detection, Sybil attack detection, cross-validation
- Audit logger: full event sourcing, resource timelines, severity-based alerting, import/export

#### Release Preparation (Phase 10)
- SchemaValidator: full JSON Schema → Zod conversion (string, number, boolean, array, object, enum, oneOf, anyOf)
- Schema caching for performance
- FileStorage: JSON file-based persistent storage implementing StorageProvider
- Updated README with API reference, configuration guide, examples
- .npmignore for clean npm publishing
- CI: coverage reporting and auto-publish workflow

### Changed
- DAGEngine rewritten from 42-line stub to full orchestration engine
- SwarmFlow rewritten from 27-line wrapper to complete lifecycle manager
- MastraExecutor rewritten from placeholder to dual-mode executor
- WorkerThread rewritten from empty start to full poll-execute loop
- TaskBoard enhanced with events, heartbeat, CAS, expiry, maxRetry
- SchemaValidator upgraded from stub to full JSON Schema → Zod converter

## [0.1.0] - 2026-04-21

### Added
- Initial release of SwarmFlow
- Core mission orchestration framework
- Dynamic DAG engine for task execution
- Agent blueprint and convergence system
- Mastra Agent integration
- Worker pool for distributed execution
- In-memory storage implementation
- Basic checkpointing mechanism
- REST API for mission and task management
- TypeScript type definitions
- CI/CD pipeline with GitHub Actions
