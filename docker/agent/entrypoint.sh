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

# Materialize AGENT_CONFIG from base64-encoded environment variable (always provided)
if [ -z "$AGENT_CONFIG_BASE64" ]; then
  echo "ERROR: No AGENT_CONFIG_BASE64 environment variable provided"
  echo "AGENT_CONFIG_BASE64 is required and should be automatically provided by the container manager."
  echo "This is a bug - please report it."
  exit 1
fi

echo "Materializing agent configuration from AGENT_CONFIG_BASE64 environment variable..."
mkdir -p /root/.config/opencode
# Decode base64 and write to config file
echo "$AGENT_CONFIG_BASE64" | base64 -d > /root/.config/opencode/opencode.json
echo "✓ Agent configuration written to /root/.config/opencode/opencode.json"
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

# Task delivery via messaging system + stdin approach
echo "Task delivery: Messaging system + stdin command"
echo "Sending 'get your messages' command to OpenCode via stdin"
echo "Agent type: ${AGENT_TYPE}"

# Start OpenCode with agent flag and send initial command via stdin
if [ -n "$AGENT_TYPE" ]; then
  printf "get your messages\n" | exec "$OPENCODE_BIN" --agent "$AGENT_TYPE"
else
  printf "get your messages\n" | exec "$OPENCODE_BIN"
fi
