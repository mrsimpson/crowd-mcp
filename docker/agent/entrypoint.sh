#!/bin/sh
set -e

echo "========================================="
echo "Crowd-MCP Agent Container"
echo "========================================="
echo "Agent ID: ${AGENT_ID}"
echo "Task: ${TASK}"
echo "Workspace: /workspace"
echo "========================================="

# Check if TASK is provided
if [ -z "$TASK" ]; then
  echo "ERROR: No TASK environment variable provided"
  echo "Container will remain idle. Set TASK to execute OpenCode."
  exec tail -f /dev/null
fi

# Materialize AGENT_CONFIG from environment variable if provided
if [ -n "$AGENT_CONFIG" ]; then
  echo "Materializing agent configuration from AGENT_CONFIG environment variable..."
  mkdir -p /root/.config/opencode
  echo "$AGENT_CONFIG" > /root/.config/opencode/opencode.json
  echo "✓ Agent configuration written to /root/.config/opencode/opencode.json"
else
  echo "No AGENT_CONFIG provided - using existing config from mount (legacy mode)"
fi
echo ""

# Start OpenCode with the provided task
echo "Starting OpenCode..."
echo ""

# Debug: Show npm and PATH configuration
echo "PATH: $PATH"
NPM_PREFIX=$(npm config get prefix)
echo "npm prefix: $NPM_PREFIX"
echo "npm root -g: $(npm root -g)"

# Try to locate opencode
OPENCODE_BIN=""
if command -v opencode >/dev/null 2>&1; then
  OPENCODE_BIN="opencode"
  echo "Found opencode via PATH: $(which opencode)"
elif [ -f "$NPM_PREFIX/bin/opencode" ]; then
  OPENCODE_BIN="$NPM_PREFIX/bin/opencode"
  echo "Found opencode via npm prefix: $OPENCODE_BIN"
else
  echo "ERROR: opencode command not found"
  echo "Searching for opencode files:"
  find /usr -name "*opencode*" 2>/dev/null || true
  echo ""
  echo "npm global packages:"
  npm list -g --depth=0 || true
  echo ""
  echo "Contents of $NPM_PREFIX/bin:"
  ls -la "$NPM_PREFIX/bin" || true
  exit 1
fi

# Execute OpenCode in the workspace directory
cd /workspace

# EXPERIMENT: Start OpenCode without stdin, wait for SSE task delivery
echo "Experiment: Starting OpenCode without stdin task delivery"
echo "Task will be delivered via SSE from Agent MCP Server"
exec "$OPENCODE_BIN"
