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

# Enhanced task delivery: Messaging system + stdin + notification monitoring
echo "Task delivery: Enhanced messaging system with notification monitoring"
echo "Agent type: ${AGENT_TYPE}"

# Create notification monitoring script
NOTIFICATION_SCRIPT="/tmp/notification-monitor.sh"
cat > "$NOTIFICATION_SCRIPT" << 'EOF'
#!/bin/sh
AGENT_ID="$1"
NOTIFICATION_PIPE="/tmp/crowd-notifications/${AGENT_ID}.pipe"
NOTIFICATION_DIR="/tmp/crowd-file-notifications/${AGENT_ID}"

echo "Starting notification monitor for agent: $AGENT_ID"

# Monitor named pipe if it exists
if [ -p "$NOTIFICATION_PIPE" ]; then
  echo "Monitoring named pipe: $NOTIFICATION_PIPE"
  while true; do
    if read -r notification < "$NOTIFICATION_PIPE"; then
      echo "Received notification: $notification"
      # Send command to OpenCode via stdin
      echo "get your messages" >&3
    fi
  done &
  PIPE_PID=$!
fi

# Monitor file-based notifications as fallback
if [ -d "$NOTIFICATION_DIR" ]; then
  echo "Monitoring file notifications: $NOTIFICATION_DIR"
  while true; do
    # Check for new notification files every 2 seconds
    NEW_FILES=$(find "$NOTIFICATION_DIR" -name "*.signal" -newer /tmp/last_check 2>/dev/null | wc -l)
    if [ "$NEW_FILES" -gt 0 ]; then
      echo "Found $NEW_FILES new notification file(s)"
      # Clean up notification files
      find "$NOTIFICATION_DIR" -name "*.signal" -delete 2>/dev/null
      # Send command to OpenCode via stdin
      echo "get your messages" >&3
    fi
    # Update timestamp for next check
    touch /tmp/last_check
    sleep 2
  done &
  FILE_PID=$!
fi

# Keep script running
wait
EOF

chmod +x "$NOTIFICATION_SCRIPT"

# Start OpenCode with enhanced notification support
echo "Starting OpenCode with notification monitoring..."

if [ -n "$AGENT_TYPE" ]; then
  # Use file descriptor 3 for sending commands to OpenCode
  exec 3>&1
  {
    # Send initial command
    echo "get your messages"
    # Start notification monitor in background
    "$NOTIFICATION_SCRIPT" "$AGENT_ID" &
    MONITOR_PID=$!
    # Keep stdin open for manual commands and notifications
    cat
  } | exec "$OPENCODE_BIN" --agent "$AGENT_TYPE"
else
  # Use file descriptor 3 for sending commands to OpenCode  
  exec 3>&1
  {
    # Send initial command
    echo "get your messages"
    # Start notification monitor in background
    "$NOTIFICATION_SCRIPT" "$AGENT_ID" &
    MONITOR_PID=$!
    # Keep stdin open for manual commands and notifications
    cat
  } | exec "$OPENCODE_BIN"
fi
