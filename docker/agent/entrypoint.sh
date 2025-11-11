#!/bin/sh
set -e

echo "========================================="
echo "Crowd-MCP Agent Container"
echo "========================================="
echo "Agent ID: ${AGENT_ID}"
echo "Task: ${TASK}"
echo "========================================="

# Check if TASK is provided
if [ -z "$TASK" ]; then
  echo "ERROR: No TASK environment variable provided"
  exec tail -f /dev/null
fi

# Materialize AGENT_CONFIG from base64-encoded environment variable
if [ -z "$AGENT_CONFIG_BASE64" ]; then
  echo "ERROR: No AGENT_CONFIG_BASE64 environment variable provided"
  exit 1
fi

echo "Materializing agent configuration..."
mkdir -p /root/.config/opencode
echo "$AGENT_CONFIG_BASE64" | base64 -d > /root/.config/opencode/opencode.json
echo "✓ Agent configuration written"

# Set environment variables to avoid Bun installation issues
export BUN_INSTALL_CACHE_DIR="/tmp/bun-cache"
export NODE_ENV="production"
export NODE_TLS_REJECT_UNAUTHORIZED="0"  # Disable TLS verification for package installs
export BUN_CONFIG_NO_VERIFY="1"          # Disable Bun certificate verification

# Find OpenCode binary
OPENCODE_BIN=""
if command -v opencode >/dev/null 2>&1; then
  OPENCODE_BIN="opencode"
elif [ -f "$(npm config get prefix)/bin/opencode" ]; then
  OPENCODE_BIN="$(npm config get prefix)/bin/opencode"
else
  echo "ERROR: opencode command not found"
  exit 1
fi

cd /workspace

echo "Starting OpenCode ACP as PID 1 with preserved stdin..."

# Start OpenCode ACP as PID 1 - stdin will be available via docker exec -i
exec "$OPENCODE_BIN" acp --print-logs --log-level DEBUG
