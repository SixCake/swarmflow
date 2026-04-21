#!/usr/bin/env bash
# SwarmFlow Terminal — Automated Setup & Registration
# Designed for AI agents: fully automated, no human interaction.
#
# The server URL and admin token are read from scripts/config.env (shipped with the skill).
# The only required input is SWARMFLOW_IDENTITY_ID (your agent/robot name).
#
# Required:
#   SWARMFLOW_IDENTITY_ID    — Your agent name (e.g. "alice-bot", "coder-01")
#
# Optional overrides:
#   SWARMFLOW_CAPABILITIES   — Comma-separated (default: "analysis,review,research,coding")
#   SWARMFLOW_ENV_FILE       — Credential save path (default: ~/.swarmflow.env)
#
# Usage:
#   SWARMFLOW_IDENTITY_ID=my-agent bash scripts/setup.sh
#
# Exit codes:
#   0 — Success (credentials saved, JSON output on stdout)
#   1 — Missing dependencies or required input
#   2 — Server unreachable
#   3 — Registration failed

set -euo pipefail

# ─── Resolve Skill Root ─────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_ROOT="$(dirname "$SCRIPT_DIR")"

# ─── Load Server Config from Skill ──────────────────────────

CONFIG_FILE="${SCRIPT_DIR}/config.env"
if [ ! -f "$CONFIG_FILE" ]; then
  echo '{"error":"config_missing","message":"scripts/config.env not found in skill directory"}' >&2
  exit 1
fi
# shellcheck source=/dev/null
source "$CONFIG_FILE"

# ─── Defaults & Overrides ───────────────────────────────────

SWARMFLOW_API_URL="${SWARMFLOW_API_URL:?config.env must define SWARMFLOW_API_URL}"
SWARMFLOW_ADMIN_TOKEN="${SWARMFLOW_ADMIN_TOKEN:-setup}"
SWARMFLOW_IDENTITY_ID="${SWARMFLOW_IDENTITY_ID:-}"
SWARMFLOW_CAPABILITIES="${SWARMFLOW_CAPABILITIES:-analysis,review,research,coding}"
SWARMFLOW_ENV_FILE="${SWARMFLOW_ENV_FILE:-$HOME/.swarmflow.env}"

# ─── Helpers ─────────────────────────────────────────────────

log()   { echo "[swarmflow-setup] $1" >&2; }
die()   { echo "[swarmflow-setup] ERROR: $1" >&2; exit "${2:-1}"; }

# ─── Validate ───────────────────────────────────────────────

for cmd in curl jq; do
  command -v "$cmd" &>/dev/null || die "Missing required tool: $cmd" 1
done

[ -z "$SWARMFLOW_IDENTITY_ID" ] && die "SWARMFLOW_IDENTITY_ID is required — set it to your agent/robot name" 1

# Strip trailing slash
SWARMFLOW_API_URL="${SWARMFLOW_API_URL%/}"

# ─── Skip if Already Registered ─────────────────────────────

if [ -f "$SWARMFLOW_ENV_FILE" ] && grep -q "SWARMFLOW_TERMINAL_ID" "$SWARMFLOW_ENV_FILE" 2>/dev/null; then
  # shellcheck source=/dev/null
  source "$SWARMFLOW_ENV_FILE"
  if [ -n "${SWARMFLOW_TERMINAL_ID:-}" ] && [ -n "${SWARMFLOW_API_KEY:-}" ]; then
    # Verify existing credentials still work
    verify=$(curl -sf --connect-timeout 5 \
      -H "Authorization: Bearer $SWARMFLOW_API_KEY" \
      "${SWARMFLOW_API_URL}/api/terminals/me" 2>/dev/null) || verify=""
    if [ -n "$verify" ]; then
      is_active=$(echo "$verify" | jq -r '.isActive' 2>/dev/null || echo "false")
      if [ "$is_active" = "true" ]; then
        log "Already registered (terminalId=${SWARMFLOW_TERMINAL_ID}), credentials valid — skipping"
        jq -n \
          --arg url "$SWARMFLOW_API_URL" \
          --arg key "$SWARMFLOW_API_KEY" \
          --arg tid "$SWARMFLOW_TERMINAL_ID" \
          --arg iid "$SWARMFLOW_IDENTITY_ID" \
          --arg caps "$SWARMFLOW_CAPABILITIES" \
          --arg status "already_registered" \
          '{ status:$status, terminalId:$tid, apiKey:$key, apiUrl:$url, identityId:$iid, capabilities:($caps|split(",")) }'
        exit 0
      fi
    fi
    log "Existing credentials invalid — re-registering"
  fi
fi

# ─── Step 1: Health Check ───────────────────────────────────

log "Checking server at ${SWARMFLOW_API_URL} ..."

health_response=$(curl -sf --connect-timeout 10 "${SWARMFLOW_API_URL}/health" 2>/dev/null) \
  || die "Cannot reach ${SWARMFLOW_API_URL}/health — is the server running?" 2

health_status=$(echo "$health_response" | jq -r '.status' 2>/dev/null || echo "unknown")
[ "$health_status" = "ok" ] || die "Server health: $health_status" 2

log "Server healthy"

# ─── Step 2: Register ───────────────────────────────────────

IFS=',' read -ra CAP_ARRAY <<< "$SWARMFLOW_CAPABILITIES"
caps_json=$(printf '%s\n' "${CAP_ARRAY[@]}" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | jq -R . | jq -s .)

payload=$(jq -n --arg id "$SWARMFLOW_IDENTITY_ID" --argjson caps "$caps_json" \
  '{ identityId: $id, capabilities: $caps }')

log "Registering '${SWARMFLOW_IDENTITY_ID}' ..."

# Registration endpoint is open (no auth required for new terminals)
response=$(curl -sw '\n%{http_code}' -X POST \
  -H "Content-Type: application/json" \
  -d "$payload" \
  "${SWARMFLOW_API_URL}/api/terminals/register" 2>/dev/null)

http_code=$(echo "$response" | tail -1)
body=$(echo "$response" | sed '$d')

case "$http_code" in
  201) ;;
  401) die "Auth failed — check SWARMFLOW_ADMIN_TOKEN in config.env" 3 ;;
  429) die "Terminal limit exceeded for '${SWARMFLOW_IDENTITY_ID}'" 3 ;;
  *)   die "Registration failed (HTTP ${http_code}): ${body}" 3 ;;
esac

TERMINAL_ID=$(echo "$body" | jq -r '.terminalId')
API_KEY=$(echo "$body" | jq -r '.apiKey')

log "Registered: terminalId=${TERMINAL_ID}"

# ─── Step 3: Save Credentials ───────────────────────────────

env_block="export SWARMFLOW_API_URL=\"${SWARMFLOW_API_URL}\"
export SWARMFLOW_API_KEY=\"${API_KEY}\"
export SWARMFLOW_TERMINAL_ID=\"${TERMINAL_ID}\""

{
  echo ""
  echo "# SwarmFlow Terminal — registered $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "# Identity: ${SWARMFLOW_IDENTITY_ID} | Capabilities: ${SWARMFLOW_CAPABILITIES}"
  echo "$env_block"
} > "$SWARMFLOW_ENV_FILE"

chmod 600 "$SWARMFLOW_ENV_FILE"
log "Credentials saved to ${SWARMFLOW_ENV_FILE}"

# ─── Step 4: Verify ─────────────────────────────────────────

verify_response=$(curl -sf --connect-timeout 5 \
  -H "Authorization: Bearer ${API_KEY}" \
  "${SWARMFLOW_API_URL}/api/terminals/me" 2>/dev/null) || verify_response=""

verified="false"
if [ -n "$verify_response" ]; then
  verified_id=$(echo "$verify_response" | jq -r '.terminalId' 2>/dev/null || echo "")
  [ "$verified_id" = "$TERMINAL_ID" ] && verified="true"
fi

log "Verification: $verified"

# ─── Output JSON ────────────────────────────────────────────

HEARTBEAT_SCRIPT="${SKILL_ROOT}/scripts/heartbeat.sh"
CRON_CMD="* * * * * /bin/bash ${HEARTBEAT_SCRIPT} >> ~/.swarmflow-heartbeat.log 2>&1"
LOOP_CMD="nohup bash -c 'while true; do bash \"${HEARTBEAT_SCRIPT}\" >> ~/.swarmflow-heartbeat.log 2>&1; sleep 60; done' &"

jq -n \
  --arg url "$SWARMFLOW_API_URL" \
  --arg key "$API_KEY" \
  --arg tid "$TERMINAL_ID" \
  --arg iid "$SWARMFLOW_IDENTITY_ID" \
  --arg caps "$SWARMFLOW_CAPABILITIES" \
  --arg envFile "$SWARMFLOW_ENV_FILE" \
  --arg verified "$verified" \
  --arg heartbeat "$HEARTBEAT_SCRIPT" \
  --arg cronCmd "$CRON_CMD" \
  --arg loopCmd "$LOOP_CMD" \
  '{
    status: "registered",
    terminalId: $tid,
    apiKey: $key,
    apiUrl: $url,
    identityId: $iid,
    capabilities: ($caps | split(",")),
    envFile: $envFile,
    verified: ($verified == "true"),
    heartbeatScript: $heartbeat,
    nextSteps: {
      cronJob: "(crontab -l 2>/dev/null | grep -v swarmflow.*heartbeat ; echo \"\($cronCmd)\") | crontab -",
      backgroundLoop: $loopCmd,
      verify: ("source " + $envFile + " && bash " + $heartbeat)
    }
  }'

log "🐝 Setup complete"
log "Next: create a cron job or background loop using the commands in the JSON output above"
log "Then verify: source ${SWARMFLOW_ENV_FILE} && bash ${HEARTBEAT_SCRIPT}"
