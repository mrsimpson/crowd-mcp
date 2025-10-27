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

# Debug: Show PATH and OpenCode location
echo "PATH: $PATH"
which opencode || echo "WARNING: 'which opencode' failed"
ls -la /usr/local/bin/opencode 2>/dev/null || echo "WARNING: /usr/local/bin/opencode not found"

# Execute OpenCode in the workspace directory
cd /workspace

# Try to find and execute opencode
if command -v opencode >/dev/null 2>&1; then
  exec opencode "$TASK"
else
  echo "ERROR: opencode command not found in PATH"
  echo "Available commands in /usr/local/bin/:"
  ls -la /usr/local/bin/ | grep -E 'opencode|node' || true
  exit 1
fi
