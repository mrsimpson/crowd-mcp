# Testing Log Streaming - Manual Test Guide

## Prerequisites

1. **Docker** installed and running
2. **Agent image** built:

   ```bash
   cd crowd-mcp
   docker build -t crowd-mcp-agent:latest -f docker/agent/Dockerfile docker/agent/
   ```

3. **Dependencies** installed:

   ```bash
   pnpm install
   ```

4. **OpenCode configured** (or use `CROWD_DEMO_MODE=true`)

## Test 1: Basic Container Startup

Test that the entrypoint.sh script runs correctly:

```bash
# Run a test container manually
docker run --rm \
  -e AGENT_ID=test-123 \
  -e TASK="say hello" \
  -v $(pwd):/workspace:rw \
  crowd-mcp-agent:latest

# Expected output:
# =========================================
# Crowd-MCP Agent Container
# =========================================
# Agent ID: test-123
# Task: say hello
# Workspace: /workspace
# =========================================
# Starting OpenCode...
#
# [OpenCode output...]
```

## Test 2: Check Log Stream Type (TTY vs non-TTY)

```bash
# Start a container with TTY
docker run -d --name test-agent-tty \
  -e AGENT_ID=tty-test \
  -e TASK="echo hello" \
  -t \
  crowd-mcp-agent:latest

# Start a container without TTY
docker run -d --name test-agent-no-tty \
  -e AGENT_ID=no-tty-test \
  -e TASK="echo hello" \
  crowd-mcp-agent:latest

# Compare log outputs
echo "=== TTY logs (raw stream) ==="
docker logs test-agent-tty | xxd | head -20

echo "=== Non-TTY logs (multiplexed stream) ==="
docker logs test-agent-no-tty | xxd | head -20

# Clean up
docker rm -f test-agent-tty test-agent-no-tty
```

**Expected difference:**

- **TTY**: Direct output bytes (e.g., `48 65 6c 6c 6f` = "Hello")
- **Non-TTY**: 8-byte headers before each chunk (e.g., `01 00 00 00 00 00 00 05 48 65 6c 6c 6f`)

## Test 3: Full Integration Test

1. **Start the MCP server:**

   ```bash
   # Terminal 1
   pnpm run dev
   ```

2. **Open the web dashboard:**

   ```bash
   open http://localhost:3000
   ```

3. **Spawn an agent via MCP:**
   Use your MCP client (Claude Desktop) to call:

   ```
   spawn_agent with task: "Create a hello.txt file with 'Hello World'"
   ```

4. **Verify in the dashboard:**
   - Agent card appears ✅
   - Click "View Logs" button
   - Should see:
     - "[SSE Connected - streaming logs...]"
     - Entrypoint messages (Agent ID, Task, etc.)
     - OpenCode starting message
     - Live OpenCode output as it works

5. **Check for real-time updates:**
   - Logs should appear **without refreshing**
   - Terminal indicator should show "Live streaming" (green pulsing dot)

## Test 4: Verify SSE Stream Format

```bash
# Terminal 2 - Monitor SSE endpoint directly
curl -N http://localhost:3000/api/agents/AGENT_ID/logs/stream

# Expected output format:
# data: {"log":"[SSE Connected - streaming logs...]\n"}
#
# data: {"log":"=========================================\n"}
#
# data: {"log":"Crowd-MCP Agent Container\n"}
#
# data: {"log":"Agent ID: AGENT_ID\n"}
# ...
```

## Test 5: Error Cases

### Agent not found

```bash
curl http://localhost:3000/api/agents/nonexistent/logs/stream
# Expected: HTTP 404 with {"error":"Agent not found"}
```

### Connection interruption

```bash
# Start streaming
curl -N http://localhost:3000/api/agents/AGENT_ID/logs/stream &
PID=$!

# Kill after 2 seconds
sleep 2
kill $PID

# Check server logs - should see clean disconnect, no errors
```

## Test 6: Compare with Static Logs Endpoint

```bash
# Get static logs (should have same content, but not streaming)
curl http://localhost:3000/api/agents/AGENT_ID/logs

# Should return JSON with all logs as string
# {"logs":"=========================================\nCrowd-MCP Agent Container\n..."}
```

## Debugging Tips

### No logs appearing?

1. **Check container is running:**

   ```bash
   docker ps | grep agent-
   ```

2. **Check container logs directly:**

   ```bash
   docker logs CONTAINER_ID
   ```

3. **Check entrypoint.sh permissions:**

   ```bash
   docker exec CONTAINER_ID ls -la /entrypoint.sh
   # Should be executable (-rwxr-xr-x)
   ```

4. **Verify TASK variable:**
   ```bash
   docker exec CONTAINER_ID env | grep TASK
   ```

### Logs appear but then stop?

This is **expected** if:

- OpenCode completes the task
- Container exits
- The SSE stream sends `{"end":true}` and closes

### Browser DevTools check

Open browser console (F12) and look for:

```javascript
EventSource {url: "http://localhost:3000/api/agents/...", ...}
// readyState: 1 = OPEN (connected)
// readyState: 2 = CLOSED (disconnected)
```

## Success Criteria

✅ Container starts with entrypoint messages visible
✅ SSE connection established (green dot, "Live streaming")
✅ Logs appear in real-time without refresh
✅ No JavaScript errors in browser console
✅ No server errors in terminal
✅ Logs match what `docker logs` shows

## Known Limitations

- **Initial logs delay**: First 100 lines might take a moment to arrive (Docker API behavior)
- **ANSI codes**: OpenCode may output terminal colors/formatting - these appear as escape sequences
- **Buffering**: Very fast output might be buffered by Docker before streaming
