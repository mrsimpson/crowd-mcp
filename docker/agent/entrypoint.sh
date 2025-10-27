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

# Start OpenCode with the provided task
echo "Starting OpenCode..."
echo ""

# Debug: Show npm and PATH configuration
echo "PATH: $PATH"
echo "npm bin -g: $(npm bin -g)"
echo "npm root -g: $(npm root -g)"

# Try to locate opencode
OPENCODE_BIN=""
if command -v opencode >/dev/null 2>&1; then
  OPENCODE_BIN="opencode"
  echo "Found opencode via PATH: $(which opencode)"
elif [ -f "$(npm bin -g)/opencode" ]; then
  OPENCODE_BIN="$(npm bin -g)/opencode"
  echo "Found opencode via npm bin: $OPENCODE_BIN"
else
  echo "ERROR: opencode command not found"
  echo "Searching for opencode files:"
  find /usr -name "*opencode*" 2>/dev/null || true
  echo ""
  echo "npm global packages:"
  npm list -g --depth=0 || true
  exit 1
fi

# Execute OpenCode in the workspace directory
cd /workspace
echo "Executing: $OPENCODE_BIN $TASK"
exec "$OPENCODE_BIN" "$TASK"
