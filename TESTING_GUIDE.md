# Testing Guide for Streamable HTTP MCP Implementation

## 🧪 Testing Methods Available

### 1. **Comprehensive Automated Test Suite** (Recommended)

```bash
# Run the full test suite
node test-comprehensive.cjs
```

**What it tests:**

- ✅ Basic HTTP connectivity and CORS
- ✅ Session management (create, reuse, delete)
- ✅ MCP tools (send_message, get_my_messages, discover_agents)
- ✅ SSE streaming for real-time notifications
- ✅ Integration with main MCP server
- ✅ Error handling and edge cases
- ✅ Agent spawning end-to-end

### 2. **Quick Manual Tests**

#### Test Agent MCP Server (Port 3100)

```bash
# Start server
CROWD_DEMO_MODE=true node packages/server/dist/index.js &

# Test initialize
curl -s http://localhost:3100/mcp \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -X POST \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{}},"id":1}' | jq .

# Test tools list (using session ID from above)
curl -s http://localhost:3100/mcp \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -H "Mcp-Session-Id: YOUR_SESSION_ID" \
  -X POST \
  -d '{"jsonrpc":"2.0","method":"tools/list","params":{},"id":2}' | jq .

# Test SSE streaming
curl -N http://localhost:3100/mcp \
  -H "Accept: text/event-stream" \
  -H "Mcp-Session-Id: YOUR_SESSION_ID"
```

#### Test Main MCP Server (stdio)

```bash
# In one terminal
CROWD_DEMO_MODE=true node packages/server/dist/index.js

# In another terminal, send JSON-RPC via stdin
echo '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{}},"id":1}' | nc localhost stdin

# Test agent spawning
echo '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"spawn_agent","arguments":{"task":"Hello world test"}},"id":2}'
```

### 3. **Browser-based Testing**

#### WebSocket/SSE Client Test

```html
<!DOCTYPE html>
<html>
  <head>
    <title>MCP SSE Test</title>
  </head>
  <body>
    <div id="output"></div>
    <script>
      // Test SSE streaming
      const eventSource = new EventSource("http://localhost:3100/mcp", {
        headers: { Accept: "text/event-stream" },
      });

      eventSource.onmessage = function (event) {
        document.getElementById("output").innerHTML +=
          "<div>Received: " + event.data + "</div>";
      };

      eventSource.onerror = function (event) {
        console.error("SSE error:", event);
      };
    </script>
  </body>
</html>
```

### 4. **Performance Testing**

#### Load Test Script

```bash
# Test multiple concurrent sessions
for i in {1..10}; do
  curl -s http://localhost:3100/mcp \
    -H "Accept: application/json" \
    -H "Content-Type: application/json" \
    -X POST \
    -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{}},"id":'$i'}' &
done
wait
```

### 5. **Integration Testing with Real Agents**

#### End-to-End Agent Communication Test

```bash
# 1. Start server
CROWD_DEMO_MODE=true node packages/server/dist/index.js &

# 2. Spawn agent via main MCP server
echo '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"spawn_agent","arguments":{"task":"Introduce yourself"}},"id":1}' | node packages/server/dist/index.js

# 3. Check agent status via web API
curl http://localhost:3000/api/agents | jq .

# 4. Check messages
curl http://localhost:3000/api/messages | jq .

# 5. Send message to agent
echo '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"send_message","arguments":{"to":"agent-ID","content":"Hello"}},"id":2}' | node packages/server/dist/index.js
```

### 6. **Specific Feature Tests**

#### Session Management Test

```bash
# Create session
SESSION_ID=$(curl -s -i http://localhost:3100/mcp \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -X POST \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{},"id":1}' | \
  grep -i "mcp-session-id:" | cut -d' ' -f2 | tr -d '\r\n')

echo "Created session: $SESSION_ID"

# Use session
curl -s http://localhost:3100/mcp \
  -H "Mcp-Session-Id: $SESSION_ID" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -X POST \
  -d '{"jsonrpc":"2.0","method":"tools/list","params":{},"id":2}' | jq .

# Delete session
curl -s http://localhost:3100/mcp \
  -H "Mcp-Session-Id: $SESSION_ID" \
  -X DELETE
```

#### Real-time Notifications Test

```bash
# Terminal 1: Start SSE stream
curl -N http://localhost:3100/mcp \
  -H "Accept: text/event-stream" \
  -H "Mcp-Session-Id: YOUR_SESSION_ID"

# Terminal 2: Trigger notification (send message to the agent)
curl -s http://localhost:3100/mcp \
  -H "Mcp-Session-Id: YOUR_SESSION_ID" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -X POST \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"send_message","arguments":{"to":"agent-ID","content":"Test notification"}},"id":3}'
```

## 🎯 What Each Test Validates

### ✅ **Core MCP Protocol Compliance**

- JSON-RPC 2.0 message format
- Initialize/tools/call request-response cycle
- Error handling with proper error codes
- Protocol version negotiation

### ✅ **Streamable HTTP Transport Features**

- Single `/mcp` endpoint handling GET/POST/DELETE
- Session management with `Mcp-Session-Id` header
- Both JSON responses and SSE streams
- Message batching and stream resumability
- Real-time notifications

### ✅ **Agent Communication**

- Agent spawning via main MCP server
- Message delivery to agent inboxes
- Agent-to-agent communication tools
- Agent discovery and status tracking

### ✅ **Production Readiness**

- Error handling and graceful degradation
- CORS support for web clients
- Session cleanup and resource management
- Performance under concurrent load
- Health monitoring endpoints

## 🚀 Quick Verification Commands

```bash
# 1. Build and start
npm run build
CROWD_DEMO_MODE=true node packages/server/dist/index.js &

# 2. Quick health check
curl http://localhost:3100/health

# 3. Run comprehensive tests
node test-comprehensive.cjs

# 4. Stop server
pkill -f "packages/server/dist/index.js"
```

## 📊 Expected Test Results

**Healthy system should show:**

- ✅ All basic connectivity tests pass
- ✅ Session management works correctly
- ✅ All 4 messaging tools are available
- ✅ SSE streaming establishes successfully
- ✅ Agent spawning works end-to-end
- ✅ 95%+ success rate on comprehensive tests

**Red flags to watch for:**

- ❌ "Not connected" errors (should be completely eliminated)
- ❌ Session creation failures
- ❌ SSE stream connection failures
- ❌ Tool calls returning errors
- ❌ Agent spawning failures

The comprehensive test suite is the best way to validate everything works correctly!

## ACP (Agent Client Protocol) Testing

### Direct Container Communication Tests

Test direct ACP communication with spawned containers to verify stdin connectivity and protocol implementation.

#### Prerequisites

- Docker running
- Agent container spawned (get container ID from logs or `docker ps`)

#### Test Scripts

**1. Basic RPC Communication Test**

```bash
# Test initialize and session creation
node test-direct-rpc.cjs <container-id>
```

**Expected Output:**
- ✅ Initialize response with protocol version 1
- ✅ Session creation with valid session ID
- ✅ Session update notifications

**2. Full Prompt Flow Test**

```bash
# Test complete prompt and response flow
node test-prompt-direct.cjs <container-id>
```

**Expected Output:**
- ✅ Initialize and session creation
- ✅ Prompt processing with streaming response chunks
- ✅ Complete response with stop reason

#### Test Script Details

**`test-direct-rpc.cjs`**
- Tests basic ACP handshake (initialize + session/new)
- Verifies container responds to JSON-RPC messages
- Confirms stdin connectivity via `docker exec -i`

**`test-prompt-direct.cjs`**
- Full ACP workflow including prompt sending
- Tests streaming response handling
- Validates session management and message flow

#### Troubleshooting

**Container Not Responding:**
```bash
# Check if container is running
docker ps | grep crowd-mcp-agent

# Check container logs
docker logs <container-id>

# Verify OpenCode is running
docker exec <container-id> ps aux | grep opencode
```

**Stdin Issues:**
```bash
# Test basic stdin connectivity
echo '{"test": true}' | docker exec -i <container-id> cat

# Verify container was created with proper flags
docker inspect <container-id> | grep -A5 -B5 "OpenStdin\|AttachStdin\|Tty"
```

### Integration Testing

Test message forwarding from crowd-mcp server to containers via ACP.

#### End-to-End Message Flow

```bash
# 1. Start crowd-mcp server in demo mode
CROWD_DEMO_MODE=true HTTP_PORT=3002 AGENT_MCP_PORT=3102 node packages/server/dist/index.js

# 2. Spawn agent via MCP tools
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"spawn_agent","arguments":{"task":"Test message forwarding"}}}' | node packages/server/dist/index.js

# 3. Send message to agent
echo '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"send_message","arguments":{"to":"agent-<id>","content":"Hello agent!"}}}' | node packages/server/dist/index.js
```

#### Expected Behavior

1. **Agent Spawn:** Container created with ACP client connection
2. **Message Send:** Message forwarded via ACP to container
3. **Agent Response:** Container processes message and responds

#### Current Known Issues

- ✅ **Direct RPC:** Works perfectly
- ❌ **Message Forwarding:** Integration layer issue - containers don't react to messages from server
- 🔍 **Root Cause:** Session ID mismatch or message routing problem
