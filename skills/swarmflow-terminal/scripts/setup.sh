#!/usr/bin/env bash
# SwarmFlow Terminal — Automated Setup & Registration
# Designed for AI agents: zero human interaction, all config via env vars or CLI args.
#
# Required env vars:
#   SWARMFLOW_API_URL        — SwarmFlow server URL (e.g. http://localhost:3000)
#   SWARMFLOW_IDENTITY_ID    — Your agent identity (e.g. agent name or org ID)
#
# Optional env vars:
#   SWARMFLOW_CAPABILITIES   — Comma-separated capabilities (default: "analysis,review,research,coding")
#   SWARMFLOW_ADMIN_TOKEN    — Admin token for registration auth (default: "setup")
#   SWARMFLOW_ENV_FILE       — Path to save credentials (default: ~/.swarmflow.env)
#   SWARMFLOW_OUTPUT_FORMAT  — "env" (default), "json", or "quiet"
#
# Usage:
#   SWARMFLOW_API_URL=http://localhost:3000 SWARMFLOW_IDENTITY_ID=my-agent bash scripts/setup.sh
#
#   # With custom capabilities:
#   SWARMFLOW_API_URL=http://localhost:3000 \
#   SWARMFLOW_IDENTITY_ID=my-agent \
#   SWARMFLOW_CAPABILITIES=coding,testing,review \
#   bash scripts/setup.sh
#
#   # JSON output (for programmatic consumption):
#   SWARMFLOW_OUTPUT_FORMAT=json bash scripts/setup.sh
#
# Exit codes:
#   0 — Success
#   1 — Missing dependencies or required env vars
#   2 — Server unreachable
#   3 — Registration failed (auth, limit, or server error)

set -euo pipefail

# ─── Defaults ────────────────────────────────────────────────

SWARMFLOW_API_URL="${SWARMFLOW_API_URL:-}"
SWARMFLOW_IDENTITY_ID="${SWARMFLOW_IDENTITY_ID:-}"
SWARMFLOW_CAPABILITIES="${SWARMFLOW_CAPABILITIES:-analysis,review,research,coding}"
SWARMFLOW_ADMIN_TOKEN="${SWARMFLOW_ADMIN_TOKEN:-setup}"
SWARMFLOW_ENV_FILE="${SWARMFLOW_ENV_FILE:-$HOME/.swarmflow.env}"
SWARMFLOW_OUTPUT_FORMAT="${SWARMFLOW_OUTPUT_FORMAT:-env}"

# ─── Helpers ─────────────────────────────────────────────────

log()   { [ "$SWARMFLOW_OUTPUT_FORMAT" != "quiet" ] && echo "[swarmflow-setup] $1" >&2 || true; }
die()   { echo "[swarmflow-setup] ERROR: $1" >&2; exit "${2:-1}"; }

# ─── Validate Dependencies ──────────────────────────────────

for cmd in curl jq; do
  command -v "$cmd" &>/dev/null || die "Missing required tool: $cmd" 1
done

# ─── Validate Required Env Vars ─────────────────────────────

[ -z "$SWARMFLOW_API_URL" ] && die "SWARMFLOW_API_URL is required" 1
[ -z "$SWARMFLOW_IDENTITY_ID" ] && die "SWARMFLOW_IDENTITY_ID is required" 1

# Strip trailing slash
SWARMFLOW_API_URL="${SWARMFLOW_API_URL%/}"

# ─── Step 1: Health Check ───────────────────────────────────

log "Checking server health at ${SWARMFLOW_API_URL}/health ..."

health_response=$(curl -sf --connect-timeout 10 "${SWARMFLOW_API_URL}/health" 2>/dev/null) \
  || die "Cannot reach ${SWARMFLOW_API_URL}/health — is the server running?" 2

health_status=$(echo "$health_response" | jq -r '.status' 2>/dev/null || echo "unknown")
[ "$health_status" = "ok" ] || die "Server health check returned: $health_status" 2

log "Server is healthy"

# ─── Step 2: Build Registration Payload ─────────────────────

# Parse capabilities into JSON array
IFS=',' read -ra CAP_ARRAY <<< "$SWARMFLOW_CAPABILITIES"
caps_json=$(printf '%s\n' "${CAP_ARRAY[@]}" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | jq -R . | jq -s .)

payload=$(jq -n \
  --arg id "$SWARMFLOW_IDENTITY_ID" \
  --argjson caps "$caps_json" \
  '{ identityId: $id, capabilities: $caps }')

log "Registering terminal for identity '${SWARMFLOW_IDENTITY_ID}' with capabilities: ${SWARMFLOW_CAPABILITIES}"

# ─── Step 3: Register ───────────────────────────────────────

response=$(curl -sw '\n%{http_code}' \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${SWARMFLOW_ADMIN_TOKEN}" \
  -d "$payload" \
  "${SWARMFLOW_API_URL}/api/terminals/register" 2>/dev/null)

http_code=$(echo "$response" | tail -1)
body=$(echo "$response" | sed '$d')

case "$http_code" in
  201) ;;
  401) die "Authentication failed — check SWARMFLOW_ADMIN_TOKEN" 3 ;;
  429) die "Terminal limit exceeded for identity '${SWARMFLOW_IDENTITY_ID}'" 3 ;;
  *)   die "Registration failed (HTTP ${http_code}): ${body}" 3 ;;
esac

TERMINAL_ID=$(echo "$body" | jq -r '.terminalId')
API_KEY=$(echo "$body" | jq -r '.apiKey')

log "Registration successful: terminalId=${TERMINAL_ID}"

# ─── Step 4: Verify ─────────────────────────────────────────

log "Verifying API key..."

verify_response=$(curl -sf --connect-timeout 5 \
  -H "Authorization: Bearer ${API_KEY}" \
  "${SWARMFLOW_API_URL}/api/terminals/me" 2>/dev/null) || true

if [ -n "$verify_response" ]; then
  verified_id=$(echo "$verify_response" | jq -r '.terminalId' 2>/dev/null || echo "")
  if [ "$verified_id" = "$TERMINAL_ID" ]; then
    log "API key verified successfully"
  else
    log "Warning: verification returned unexpected terminal ID"
  fi
else
  log "Warning: could not verify API key (non-critical)"
fi

# ─── Step 5: Save Credentials ───────────────────────────────

env_block="export SWARMFLOW_API_URL=\"${SWARMFLOW_API_URL}\"
export SWARMFLOW_API_KEY=\"${API_KEY}\"
export SWARMFLOW_TERMINAL_ID=\"${TERMINAL_ID}\""

{
  echo ""
  echo "# SwarmFlow Terminal — registered $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "# Identity: ${SWARMFLOW_IDENTITY_ID} | Capabilities: ${SWARMFLOW_CAPABILITIES}"
  echo "$env_block"
} >> "$SWARMFLOW_ENV_FILE"

log "Credentials saved to ${SWARMFLOW_ENV_FILE}"

# ─── Step 6: Output ─────────────────────────────────────────

case "$SWARMFLOW_OUTPUT_FORMAT" in
  json)
    jq -n \
      --arg url "$SWARMFLOW_API_URL" \
      --arg key "$API_KEY" \
      --arg tid "$TERMINAL_ID" \
      --arg iid "$SWARMFLOW_IDENTITY_ID" \
      --arg caps "$SWARMFLOW_CAPABILITIES" \
      --arg envFile "$SWARMFLOW_ENV_FILE" \
      '{
        terminalId: $tid,
        apiKey: $key,
        apiUrl: $url,
        identityId: $iid,
        capabilities: ($caps | split(",")),
        envFile: $envFile
      }'
    ;;
  env)
    echo "$env_block"
    ;;
  quiet)
    # No stdout output — credentials are in the env file
    ;;
esac

log "🐝 Terminal ready — source ${SWARMFLOW_ENV_FILE} to load credentials"
