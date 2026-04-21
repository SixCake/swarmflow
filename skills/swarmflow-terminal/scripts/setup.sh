#!/usr/bin/env bash
# SwarmFlow Terminal — Interactive Setup & Registration Script
# Guides openClaw agents through terminal registration, API key acquisition,
# and capability configuration.
#
# Usage:
#   bash scripts/setup.sh
#   # or with pre-set API URL:
#   SWARMFLOW_API_URL=http://localhost:3000 bash scripts/setup.sh

set -euo pipefail

# ─── Colors & Helpers ────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

info()    { echo -e "${CYAN}ℹ${RESET}  $1"; }
success() { echo -e "${GREEN}✔${RESET}  $1"; }
warn()    { echo -e "${YELLOW}⚠${RESET}  $1"; }
error()   { echo -e "${RED}✖${RESET}  $1"; }

banner() {
  echo ""
  echo -e "${BOLD}${CYAN}╔══════════════════════════════════════════════╗${RESET}"
  echo -e "${BOLD}${CYAN}║     🐝 SwarmFlow Terminal Setup Wizard      ║${RESET}"
  echo -e "${BOLD}${CYAN}╚══════════════════════════════════════════════╝${RESET}"
  echo ""
}

# ─── Dependency Check ────────────────────────────────────────

check_dependencies() {
  local missing=()
  for cmd in curl jq; do
    if ! command -v "$cmd" &>/dev/null; then
      missing+=("$cmd")
    fi
  done

  if [ ${#missing[@]} -gt 0 ]; then
    error "Missing required tools: ${missing[*]}"
    echo "  Install them first:"
    echo "    macOS:  brew install ${missing[*]}"
    echo "    Ubuntu: sudo apt-get install ${missing[*]}"
    exit 1
  fi
}

# ─── Step 1: API URL ────────────────────────────────────────

configure_api_url() {
  echo -e "${BOLD}Step 1/4: SwarmFlow Server URL${RESET}"
  echo ""

  if [ -n "${SWARMFLOW_API_URL:-}" ]; then
    info "Using existing SWARMFLOW_API_URL: ${SWARMFLOW_API_URL}"
  else
    echo "  Enter the SwarmFlow server URL (e.g. http://localhost:3000):"
    read -rp "  > " SWARMFLOW_API_URL
  fi

  # Strip trailing slash
  SWARMFLOW_API_URL="${SWARMFLOW_API_URL%/}"

  # Validate connectivity
  info "Testing connection to ${SWARMFLOW_API_URL}/health ..."
  local health_response
  if health_response=$(curl -sf --connect-timeout 5 "${SWARMFLOW_API_URL}/health" 2>/dev/null); then
    local status
    status=$(echo "$health_response" | jq -r '.status' 2>/dev/null || echo "unknown")
    if [ "$status" = "ok" ]; then
      success "Server is reachable and healthy"
    else
      warn "Server responded but health status is: $status"
    fi
  else
    error "Cannot reach ${SWARMFLOW_API_URL}/health"
    echo "  Make sure the SwarmFlow server is running and the URL is correct."
    exit 1
  fi
  echo ""
}

# ─── Step 2: Identity ───────────────────────────────────────

configure_identity() {
  echo -e "${BOLD}Step 2/4: Terminal Identity${RESET}"
  echo ""
  echo "  Your identity ID uniquely identifies you across terminals."
  echo "  Use a consistent name (e.g. your agent name, email, or org ID)."
  echo ""
  read -rp "  Identity ID: " IDENTITY_ID

  if [ -z "$IDENTITY_ID" ]; then
    error "Identity ID cannot be empty"
    exit 1
  fi
  success "Identity: ${IDENTITY_ID}"
  echo ""
}

# ─── Step 3: Capabilities ───────────────────────────────────

configure_capabilities() {
  echo -e "${BOLD}Step 3/4: Capabilities (Areas of Expertise)${RESET}"
  echo ""
  echo "  Select your areas of expertise. Tasks will be matched to your capabilities."
  echo ""
  echo "  Available domains:"
  echo "    1) analysis       — Data analysis, evaluation, scoring"
  echo "    2) review         — Code review, document review, quality check"
  echo "    3) research       — Information gathering, literature review"
  echo "    4) coding         — Software development, debugging"
  echo "    5) writing        — Content creation, documentation"
  echo "    6) design         — UI/UX design, architecture design"
  echo "    7) testing        — QA, test case design, verification"
  echo "    8) translation    — Language translation, localization"
  echo "    9) moderation     — Content moderation, discussion facilitation"
  echo "   10) custom         — Enter your own capabilities"
  echo ""
  echo "  Enter numbers separated by commas (e.g. 1,3,4) or 'all' for everything:"
  read -rp "  > " CAPABILITY_INPUT

  local domain_map=("analysis" "review" "research" "coding" "writing" "design" "testing" "translation" "moderation")
  CAPABILITIES=()

  if [ "$CAPABILITY_INPUT" = "all" ]; then
    CAPABILITIES=("${domain_map[@]}")
  elif [ "$CAPABILITY_INPUT" = "10" ]; then
    echo ""
    echo "  Enter custom capabilities separated by commas (e.g. ml-training,data-pipeline):"
    read -rp "  > " CUSTOM_CAPS
    IFS=',' read -ra CAPABILITIES <<< "$CUSTOM_CAPS"
  else
    IFS=',' read -ra SELECTIONS <<< "$CAPABILITY_INPUT"
    for sel in "${SELECTIONS[@]}"; do
      sel=$(echo "$sel" | tr -d ' ')
      if [[ "$sel" =~ ^[0-9]+$ ]] && [ "$sel" -ge 1 ] && [ "$sel" -le 9 ]; then
        CAPABILITIES+=("${domain_map[$((sel-1))]}")
      elif [[ "$sel" = "10" ]]; then
        echo "  Enter custom capabilities separated by commas:"
        read -rp "  > " CUSTOM_CAPS
        IFS=',' read -ra CUSTOM_ARR <<< "$CUSTOM_CAPS"
        CAPABILITIES+=("${CUSTOM_ARR[@]}")
      else
        warn "Ignoring invalid selection: $sel"
      fi
    done
  fi

  # Trim whitespace from each capability
  local trimmed=()
  for cap in "${CAPABILITIES[@]}"; do
    cap=$(echo "$cap" | xargs)
    [ -n "$cap" ] && trimmed+=("$cap")
  done
  CAPABILITIES=("${trimmed[@]}")

  if [ ${#CAPABILITIES[@]} -eq 0 ]; then
    warn "No capabilities selected. You can still claim tasks manually."
  else
    success "Capabilities: ${CAPABILITIES[*]}"
  fi
  echo ""
}

# ─── Step 4: Register ───────────────────────────────────────

register_terminal() {
  echo -e "${BOLD}Step 4/4: Registering Terminal${RESET}"
  echo ""

  # Build capabilities JSON array
  local caps_json="[]"
  if [ ${#CAPABILITIES[@]} -gt 0 ]; then
    caps_json=$(printf '%s\n' "${CAPABILITIES[@]}" | jq -R . | jq -s .)
  fi

  local payload
  payload=$(jq -n \
    --arg id "$IDENTITY_ID" \
    --argjson caps "$caps_json" \
    '{ identityId: $id, capabilities: $caps }')

  info "Registering with SwarmFlow server..."

  local response http_code body
  response=$(curl -sw '\n%{http_code}' \
    -X POST \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${SWARMFLOW_ADMIN_TOKEN:-setup}" \
    -d "$payload" \
    "${SWARMFLOW_API_URL}/api/terminals/register" 2>/dev/null)

  http_code=$(echo "$response" | tail -1)
  body=$(echo "$response" | sed '$d')

  if [ "$http_code" = "201" ]; then
    TERMINAL_ID=$(echo "$body" | jq -r '.terminalId')
    API_KEY=$(echo "$body" | jq -r '.apiKey')
    success "Registration successful!"
    echo ""
  elif [ "$http_code" = "429" ]; then
    error "Terminal limit exceeded for identity '${IDENTITY_ID}'"
    echo "  You have reached the maximum number of terminals for this identity."
    echo "  Deactivate an existing terminal first, or use a different identity."
    exit 1
  elif [ "$http_code" = "401" ]; then
    error "Authentication failed."
    echo "  Set SWARMFLOW_ADMIN_TOKEN to a valid admin token for registration."
    echo "  Example: SWARMFLOW_ADMIN_TOKEN=your-token bash scripts/setup.sh"
    exit 1
  else
    error "Registration failed (HTTP ${http_code})"
    echo "  Response: ${body}"
    exit 1
  fi
}

# ─── Output Configuration ───────────────────────────────────

output_config() {
  echo -e "${BOLD}${GREEN}═══════════════════════════════════════════════${RESET}"
  echo -e "${BOLD}${GREEN}  ✅ Setup Complete!${RESET}"
  echo -e "${BOLD}${GREEN}═══════════════════════════════════════════════${RESET}"
  echo ""
  echo -e "  ${BOLD}Terminal ID:${RESET}  ${TERMINAL_ID}"
  echo -e "  ${BOLD}API Key:${RESET}      ${API_KEY}"
  echo -e "  ${BOLD}Server:${RESET}       ${SWARMFLOW_API_URL}"
  echo -e "  ${BOLD}Capabilities:${RESET} ${CAPABILITIES[*]:-none}"
  echo ""

  # Generate env export block
  local env_block="export SWARMFLOW_API_URL=\"${SWARMFLOW_API_URL}\"
export SWARMFLOW_API_KEY=\"${API_KEY}\"
export SWARMFLOW_TERMINAL_ID=\"${TERMINAL_ID}\""

  echo -e "${BOLD}── Environment Variables ──${RESET}"
  echo ""
  echo "$env_block"
  echo ""

  # Offer to write to .env file
  echo "  Where would you like to save these credentials?"
  echo "    1) Append to ~/.swarmflow.env (recommended)"
  echo "    2) Append to .env in current directory"
  echo "    3) Print only (don't save)"
  echo ""
  read -rp "  > " SAVE_CHOICE

  local env_file=""
  case "$SAVE_CHOICE" in
    1)
      env_file="$HOME/.swarmflow.env"
      ;;
    2)
      env_file=".env"
      ;;
    3)
      info "Credentials printed above. Copy them to your environment."
      ;;
    *)
      info "No file selected. Credentials printed above."
      ;;
  esac

  if [ -n "$env_file" ]; then
    {
      echo ""
      echo "# SwarmFlow Terminal — registered $(date -u +%Y-%m-%dT%H:%M:%SZ)"
      echo "$env_block"
    } >> "$env_file"
    success "Saved to ${env_file}"
    echo ""
    echo "  Load with:  source ${env_file}"
  fi

  # openClaw skill env hint
  echo ""
  echo -e "${BOLD}── openClaw Skill Configuration ──${RESET}"
  echo ""
  echo "  If using openClaw, add to your agent config:"
  echo ""
  echo "    skills:"
  echo "      entries:"
  echo "        swarmflow-terminal:"
  echo "          env:"
  echo "            SWARMFLOW_API_URL: \"${SWARMFLOW_API_URL}\""
  echo "            SWARMFLOW_API_KEY: \"${API_KEY}\""
  echo "            SWARMFLOW_TERMINAL_ID: \"${TERMINAL_ID}\""
  echo ""

  # Verify registration
  echo -e "${BOLD}── Verification ──${RESET}"
  echo ""
  info "Verifying terminal registration..."
  local verify_response
  if verify_response=$(curl -sf \
    -H "Authorization: Bearer ${API_KEY}" \
    "${SWARMFLOW_API_URL}/api/terminals/me" 2>/dev/null); then
    local verified_id
    verified_id=$(echo "$verify_response" | jq -r '.terminalId')
    if [ "$verified_id" = "$TERMINAL_ID" ]; then
      success "Terminal verified — API key is working"
    else
      warn "Verification returned unexpected terminal ID"
    fi
  else
    warn "Could not verify terminal (server may require global token for /me)"
  fi

  echo ""
  echo -e "${BOLD}🐝 Your terminal is ready to join the swarm!${RESET}"
  echo ""
}

# ─── Main ────────────────────────────────────────────────────

main() {
  banner
  check_dependencies
  configure_api_url
  configure_identity
  configure_capabilities
  register_terminal
  output_config
}

main "$@"
