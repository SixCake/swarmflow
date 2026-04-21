#!/usr/bin/env bash
# SwarmFlow Terminal Skill — One-Line Remote Installer
# Downloads all skill files from GitHub and installs to the agent's skill directory.
#
# Usage:
#   curl -sL https://raw.githubusercontent.com/SixCake/swarmflow/main/skills/swarmflow-terminal/scripts/install.sh | bash
#
#   # With custom server URL:
#   curl -sL https://raw.githubusercontent.com/SixCake/swarmflow/main/skills/swarmflow-terminal/scripts/install.sh | SWARMFLOW_API_URL=http://myserver:3100 bash
#
#   # With custom install directory:
#   curl -sL ... | SKILL_DIR=~/.claude/skills/swarmflow-terminal bash

set -euo pipefail

# ─── Configuration ───────────────────────────────────────────

REPO_BASE="https://raw.githubusercontent.com/SixCake/swarmflow/main/skills/swarmflow-terminal"
SKILL_DIR="${SKILL_DIR:-$HOME/.claude/skills/swarmflow-terminal}"
SWARMFLOW_API_URL="${SWARMFLOW_API_URL:-http://localhost:3000}"
SWARMFLOW_ADMIN_TOKEN="${SWARMFLOW_ADMIN_TOKEN:-setup}"

# ─── Helpers ─────────────────────────────────────────────────

log() { echo "[swarmflow-install] $1" >&2; }
die() { echo "[swarmflow-install] ERROR: $1" >&2; exit 1; }

# ─── Dependency Check ────────────────────────────────────────

for cmd in curl jq; do
  command -v "$cmd" &>/dev/null || die "Missing required tool: $cmd"
done

# ─── Download Files ──────────────────────────────────────────

log "Installing SwarmFlow Terminal Skill to ${SKILL_DIR} ..."

mkdir -p "${SKILL_DIR}/scripts" "${SKILL_DIR}/references"

FILES=(
  "SKILL.md"
  "scripts/setup.sh"
  "scripts/heartbeat.sh"
  "scripts/config.env"
  "references/api-reference.md"
)

for file in "${FILES[@]}"; do
  log "  Downloading ${file} ..."
  curl -sfL "${REPO_BASE}/${file}" -o "${SKILL_DIR}/${file}" \
    || die "Failed to download ${file}"
done

# Make scripts executable
chmod +x "${SKILL_DIR}/scripts/setup.sh" "${SKILL_DIR}/scripts/heartbeat.sh"

# ─── Configure Server URL ───────────────────────────────────

# Write the actual server URL into config.env (overriding the default)
cat > "${SKILL_DIR}/scripts/config.env" << EOF
# SwarmFlow Server Configuration
# Auto-configured by install.sh at $(date -u +%Y-%m-%dT%H:%M:%SZ)

SWARMFLOW_API_URL="${SWARMFLOW_API_URL}"
SWARMFLOW_ADMIN_TOKEN="${SWARMFLOW_ADMIN_TOKEN}"
EOF

log "Server URL configured: ${SWARMFLOW_API_URL}"

# ─── Output ─────────────────────────────────────────────────

log "✅ Installation complete!"
log ""
log "Next steps:"
log "  1. Tell your agent your name (identity ID)"
log "  2. Agent runs: SWARMFLOW_IDENTITY_ID=<name> bash ${SKILL_DIR}/scripts/setup.sh"
log "  3. Agent creates cron: * * * * * bash ${SKILL_DIR}/scripts/heartbeat.sh >> ~/.swarmflow-heartbeat.log 2>&1"

# Output JSON for programmatic consumption
jq -n \
  --arg dir "$SKILL_DIR" \
  --arg url "$SWARMFLOW_API_URL" \
  --arg setup "${SKILL_DIR}/scripts/setup.sh" \
  --arg heartbeat "${SKILL_DIR}/scripts/heartbeat.sh" \
  '{
    status: "installed",
    skillDir: $dir,
    apiUrl: $url,
    setupScript: $setup,
    heartbeatScript: $heartbeat,
    nextStep: "Run setup.sh with SWARMFLOW_IDENTITY_ID=<agent-name>"
  }'
