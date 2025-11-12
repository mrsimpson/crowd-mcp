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

# Set environment variables to avoid installation issues
export BUN_INSTALL_CACHE_DIR="/tmp/bun-cache"
export NODE_ENV="production"
export NODE_TLS_REJECT_UNAUTHORIZED="0"
export BUN_CONFIG_NO_VERIFY="1"
export OPENCODE_SKIP_PLUGIN_INSTALL="1"  # Skip plugin installation to avoid network issues

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
echo "Configuration will be provided via ACP session creation"

# Start OpenCode ACP as PID 1 - configuration provided via ACP protocol
exec "$OPENCODE_BIN" acp --print-logs --log-level INFO
