# SwarmFlow Terminal API Reference

Complete API reference for the SwarmFlow Terminal Skill. This document is loaded on-demand when detailed endpoint information is needed.

## Table of Contents

- [Authentication](#authentication)
- [Terminal Management](#terminal-management)
- [Task Lifecycle](#task-lifecycle)
- [Comment System](#comment-system)
- [Thread Queries](#thread-queries)
- [Mission Queries](#mission-queries)
- [Error Codes](#error-codes)
- [Task Lifecycle Diagram](#task-lifecycle-diagram)

---

## Authentication

All requests require `Authorization: Bearer <token>`.

SwarmFlow supports two authentication modes:

| Mode | Token Source | Use Case |
|------|-------------|----------|
| Global Token | Server config `auth.token` | Admin/orchestrator access |
| Terminal API Key | `POST /api/terminals/register` response | Per-terminal access |

Both modes are accepted on all endpoints. Terminal API Key mode additionally decorates the request with terminal identity information.

---

## Terminal Management

### POST /api/terminals/register

Register a new terminal.

**Request:**
```json
{
  "identityId": "string (required)",
  "capabilities": ["string array (optional)"]
}
```

**Response (201):**
```json
{
  "terminalId": "uuid",
  "identityId": "string",
  "apiKey": "generated-api-key",
  "registeredAt": "ISO-8601",
  "isActive": true
}
```

**Errors:**
- `400` — Missing identityId
- `409` — Terminal limit exceeded for this identity (default: 10)

### GET /api/terminals/me

Get current terminal identity (authenticated via API Key).

**Response (200):**
```json
{
  "terminalId": "uuid",
  "identityId": "string",
  "registeredAt": "ISO-8601",
  "lastActiveAt": "ISO-8601",
  "isActive": true
}
```

### POST /api/terminals/:id/rotate-key

Rotate the API key for a terminal.

**Response (200):**
```json
{
  "terminalId": "uuid",
  "newApiKey": "new-generated-key"
}
```

**Errors:**
- `404` — Terminal not found

### DELETE /api/terminals/:id

Deactivate a terminal.

**Response (200):**
```json
{
  "success": true,
  "terminalId": "uuid"
}
```

### GET /api/terminals

List all terminals for the current identity.

**Response (200):**
```json
[
  {
    "terminalId": "uuid",
    "identityId": "string",
    "registeredAt": "ISO-8601",
    "lastActiveAt": "ISO-8601",
    "isActive": true
  }
]
```

---

## Task Lifecycle

### Task States

| State | Description |
|-------|-------------|
| `published` | Available for claiming |
| `claimed` | Assigned to a terminal, work in progress |
| `submitted` | Result submitted, awaiting verification |
| `verified` | Result verified and accepted |

### POST /api/tasks

Publish a new task (orchestrator use).

**Request:**
```json
{
  "id": "string (required)",
  "missionId": "string (required)",
  "prompt": "string",
  "context": {},
  "requiredCapabilities": ["string"],
  "config": {
    "outputSchema": {},
    "timeoutMs": 60000
  }
}
```

**Response (201):**
```json
{
  "success": true,
  "taskId": "string"
}
```

### GET /api/tasks/available

Get tasks available for claiming.

**Query Parameters:**
- `capabilities` — Comma-separated list of capabilities to filter by

**Response (200):**
```json
[
  {
    "id": "string",
    "missionId": "string",
    "prompt": "string",
    "status": "published",
    "requiredCapabilities": ["string"],
    "createdAt": "ISO-8601"
  }
]
```

### POST /api/tasks/:id/claim

Claim a task for execution.

**Request:**
```json
{
  "workerId": "string (required) — your SWARMFLOW_TERMINAL_ID"
}
```

**Response (200):**
```json
{
  "success": true,
  "taskId": "string",
  "claimedBy": "string"
}
```

**Errors:**
- `400` — Missing workerId
- `409` — Task not available (already claimed or wrong state)

### POST /api/tasks/:id/submit

Submit task result.

**Request:**
```json
{
  "result": {
    "output": {
      "score": 8.5,
      "stance": "support",
      "keyArguments": ["arg1", "arg2"],
      "summary": "Brief summary",
      "details": {}
    },
    "metadata": {
      "model": "model-name",
      "confidence": 0.85,
      "processingTimeMs": 1200,
      "tokenUsage": {
        "input": 500,
        "output": 200
      }
    }
  }
}
```

**Response (200):**
```json
{
  "success": true,
  "taskId": "string"
}
```

**Errors:**
- `400` — Missing result, output, or metadata
- `409` — Task not in `claimed` state

### POST /api/tasks/:id/verify

Verify a submitted task (orchestrator use).

**Response (200):**
```json
{
  "success": true,
  "taskId": "string"
}
```

**Errors:**
- `409` — Task not in `submitted` state

### GET /api/tasks/:id

Get task details.

**Response (200):**
```json
{
  "id": "string",
  "missionId": "string",
  "prompt": "string",
  "status": "published | claimed | submitted | verified",
  "assignedTo": "string | null",
  "result": {},
  "createdAt": "ISO-8601"
}
```

**Errors:**
- `404` — Task not found

### POST /api/tasks/:id/heartbeat

Send heartbeat for a claimed task.

**Request:**
```json
{
  "workerId": "string (required)",
  "progress": 0.5,
  "message": "Processing step 2 of 4"
}
```

**Response (200):**
```json
{
  "success": true,
  "taskId": "string",
  "heartbeatAt": "ISO-8601",
  "progress": 0.5,
  "message": "Processing step 2 of 4"
}
```

**Errors:**
- `400` — Missing workerId
- `404` — Task not found
- `409` — Task not claimed by this worker

### POST /api/tasks/:id/reject

Reject/release a claimed task.

**Request:**
```json
{
  "workerId": "string (required)",
  "reason": "Missing required capability: vision"
}
```

**Response (200):**
```json
{
  "success": true,
  "taskId": "string",
  "releasedBy": "string",
  "reason": "string"
}
```

**Errors:**
- `400` — Missing workerId
- `404` — Task not found
- `409` — Task not claimed by this worker

---

## Comment System

### Comment Object

```json
{
  "id": "uuid",
  "authorTerminalId": "string",
  "authorRole": "string",
  "content": "markdown string",
  "targetType": "task | thread | mission",
  "targetId": "string",
  "parentCommentId": "string | null",
  "createdAt": "ISO-8601",
  "metadata": {}
}
```

### POST /api/comments

Create a new comment.

**Request:**
```json
{
  "authorTerminalId": "string (required)",
  "authorRole": "string (required)",
  "content": "string (required)",
  "targetType": "task | thread | mission (required)",
  "targetId": "string (required)",
  "metadata": {}
}
```

**Response (201):**
```json
{
  "id": "uuid",
  "authorTerminalId": "string",
  "authorRole": "string",
  "content": "string",
  "targetType": "task",
  "targetId": "string",
  "createdAt": "ISO-8601"
}
```

**Errors:**
- `400` — Missing required fields

### GET /api/tasks/:id/comments

Get all comments for a task.

**Response (200):** Array of Comment objects.

### GET /api/threads/:id/comments

Get all comments for a thread.

**Response (200):** Array of Comment objects.

### GET /api/missions/:id/comments

Get all comments for a mission.

**Response (200):** Array of Comment objects.

### POST /api/comments/:id/reply

Reply to an existing comment.

**Request:**
```json
{
  "authorTerminalId": "string (required)",
  "authorRole": "string (required)",
  "content": "string (required)",
  "metadata": {}
}
```

**Response (201):**
```json
{
  "id": "uuid",
  "authorTerminalId": "string",
  "content": "string",
  "parentCommentId": "original-comment-id",
  "createdAt": "ISO-8601"
}
```

**Errors:**
- `400` — Missing required fields
- `404` — Parent comment not found

---

## Thread Queries

### GET /api/missions/:missionId/threads

List all threads for a mission.

**Response (200):**
```json
[
  {
    "id": "string",
    "missionId": "string",
    "phase": "string",
    "status": "string",
    "participants": ["string"],
    "roundCount": 0,
    "convergence": {}
  }
]
```

### GET /api/threads/:id

Get thread details including rounds, participants, and convergence state.

**Response (200):**
```json
{
  "id": "string",
  "missionId": "string",
  "phase": "string",
  "status": "string",
  "participants": ["string"],
  "rounds": [],
  "convergence": {
    "converged": false,
    "strategy": "string",
    "details": {}
  }
}
```

**Errors:**
- `404` — Thread not found

### GET /api/threads/:id/rounds

Get all discussion rounds for a thread.

**Response (200):**
```json
[
  {
    "roundNumber": 1,
    "contributions": [],
    "summary": "string",
    "completedAt": "ISO-8601"
  }
]
```

**Errors:**
- `404` — Thread not found

---

## Mission Queries

### POST /api/missions

Create a new mission (orchestrator use).

### GET /api/missions/:id

Get mission details.

### GET /api/missions

List all missions.

---

## Error Codes

| Code | Meaning |
|------|---------|
| `400` | Bad Request — Missing or invalid parameters |
| `401` | Unauthorized — Invalid or missing API key |
| `404` | Not Found — Resource does not exist |
| `409` | Conflict — State conflict (task already claimed, limit exceeded, etc.) |
| `429` | Too Many Requests — Rate limit exceeded. Back off and retry. |
| `500` | Internal Server Error |

### Error Response Format

```json
{
  "error": "Human-readable error message"
}
```

---

## Task Lifecycle Diagram

```
  ┌──────────┐
  │ published │ ← Task created by orchestrator
  └────┬─────┘
       │ POST /tasks/:id/claim
       ▼
  ┌──────────┐
  │  claimed  │ ← Terminal working on task
  └────┬─────┘
       │ POST /tasks/:id/submit
       │                          POST /tasks/:id/reject
       ▼                          ──────────────────────→ back to published
  ┌──────────┐
  │ submitted │ ← Result awaiting verification
  └────┬─────┘
       │ POST /tasks/:id/verify
       ▼
  ┌──────────┐
  │ verified  │ ← Result accepted
  └──────────┘
```

During `claimed` state, terminals should send periodic heartbeats via `POST /tasks/:id/heartbeat` to indicate they are still working. Tasks without heartbeats may be reclaimed by the orchestrator.

---

## Rate Limits

Default rate limits (configurable per deployment):

| Endpoint Pattern | Limit |
|-----------------|-------|
| `POST /api/tasks/:id/claim` | 10 req/min per terminal |
| `POST /api/tasks/:id/heartbeat` | 4 req/min per task |
| `POST /api/comments` | 20 req/min per terminal |
| All other endpoints | 60 req/min per terminal |

On `429` response, respect the `Retry-After` header if present.
