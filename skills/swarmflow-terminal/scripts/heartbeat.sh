#!/usr/bin/env bash
# SwarmFlow Terminal — Heartbeat & Auto-Claim Daemon
# Designed for cron: loads credentials, checks for tasks, claims one, outputs task JSON.
# The calling AI agent reads stdout to decide what to execute.
#
# Usage (cron, every minute):
#   * * * * * bash /path/to/skills/swarmflow-terminal/scripts/heartbeat.sh >> ~/.swarmflow-heartbeat.log 2>&1
#
# Behavior:
#   1. Load credentials from ~/.swarmflow.env
#   2. Verify terminal is still active
#   3. Check for available tasks
#   4. Claim the first available task
#   5. Output claimed task JSON to stdout (for agent consumption)
#   6. If a task is already claimed (in-progress), send heartbeat instead
#
# Exit codes:
#   0 — Task claimed or heartbeat sent (check stdout for details)
#   0 — No tasks available (normal idle)
#   1 — Configuration error
#   2 — Server unreachable
#   3 — Authentication failed

set -euo pipefail

# ─── Load Credentials ───────────────────────────────────────

ENV_FILE="${SWARMFLOW_ENV_FILE:-$HOME/.swarmflow.env}"

if [ ! -f "$ENV_FILE" ]; then
  echo '{"error":"credentials_missing","message":"Run setup.sh first"}' >&2
  exit 1
fi

# shellcheck source=/dev/null
source "$ENV_FILE"

for var in SWARMFLOW_API_URL SWARMFLOW_API_KEY SWARMFLOW_TERMINAL_ID; do
  if [ -z "${!var:-}" ]; then
    echo "{\"error\":\"missing_var\",\"variable\":\"$var\"}" >&2
    exit 1
  fi
done

BASE="${SWARMFLOW_API_URL%/}"
AUTH="Authorization: Bearer $SWARMFLOW_API_KEY"
TID="$SWARMFLOW_TERMINAL_ID"
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# ─── Helpers ─────────────────────────────────────────────────

api_get() {
  curl -sf --connect-timeout 10 -H "$AUTH" "$BASE$1" 2>/dev/null
}

api_post() {
  curl -sf --connect-timeout 10 -X POST \
    -H "$AUTH" -H "Content-Type: application/json" \
    -d "$2" "$BASE$1" 2>/dev/null
}

# ─── Step 1: Verify Terminal ────────────────────────────────

me_response=$(api_get "/api/terminals/me") || {
  echo "{\"event\":\"auth_failed\",\"timestamp\":\"$TIMESTAMP\"}" >&2
  exit 3
}

is_active=$(echo "$me_response" | jq -r '.isActive' 2>/dev/null || echo "false")
if [ "$is_active" != "true" ]; then
  echo "{\"event\":\"terminal_inactive\",\"timestamp\":\"$TIMESTAMP\"}" >&2
  exit 3
fi

# ─── Step 2: Check for Available Tasks ──────────────────────

tasks_response=$(api_get "/api/tasks/available") || {
  echo "{\"event\":\"server_error\",\"timestamp\":\"$TIMESTAMP\"}" >&2
  exit 2
}

task_count=$(echo "$tasks_response" | jq 'length' 2>/dev/null || echo "0")

if [ "$task_count" = "0" ] || [ "$task_count" = "null" ]; then
  # No tasks — output idle event and exit normally
  echo "{\"event\":\"idle\",\"timestamp\":\"$TIMESTAMP\",\"availableTasks\":0}"
  exit 0
fi

# ─── Step 3: Claim First Available Task ─────────────────────

task_id=$(echo "$tasks_response" | jq -r '.[0].id')
task_json=$(echo "$tasks_response" | jq '.[0]')

claim_payload=$(jq -n --arg wid "$TID" '{"workerId":$wid}')
claim_response=$(curl -sw '\n%{http_code}' --connect-timeout 10 -X POST \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d "$claim_payload" "$BASE/api/tasks/$task_id/claim" 2>/dev/null)

claim_code=$(echo "$claim_response" | tail -1)
claim_body=$(echo "$claim_response" | sed '$d')

if [ "$claim_code" = "200" ]; then
  # Successfully claimed — output task for agent execution
  echo "$task_json" | jq --arg event "task_claimed" --arg ts "$TIMESTAMP" \
    '. + {event: $event, timestamp: $ts}'
  exit 0
elif [ "$claim_code" = "409" ]; then
  # Already claimed by someone else — try next task or idle
  if [ "$task_count" -gt 1 ]; then
    # Try second task
    second_task_id=$(echo "$tasks_response" | jq -r '.[1].id')
    second_task_json=$(echo "$tasks_response" | jq '.[1]')
    second_claim=$(curl -sw '\n%{http_code}' --connect-timeout 10 -X POST \
      -H "$AUTH" -H "Content-Type: application/json" \
      -d "$claim_payload" "$BASE/api/tasks/$second_task_id/claim" 2>/dev/null)
    second_code=$(echo "$second_claim" | tail -1)
    if [ "$second_code" = "200" ]; then
      echo "$second_task_json" | jq --arg event "task_claimed" --arg ts "$TIMESTAMP" \
        '. + {event: $event, timestamp: $ts}'
      exit 0
    fi
  fi
  echo "{\"event\":\"all_tasks_contested\",\"timestamp\":\"$TIMESTAMP\",\"availableTasks\":$task_count}"
  exit 0
else
  echo "{\"event\":\"claim_failed\",\"httpCode\":$claim_code,\"timestamp\":\"$TIMESTAMP\"}" >&2
  exit 2
fi
