# ACP Integration Quick Reference

## 1. ACP Client Creation Flow

```
spawn_agent (MCP call)
    ↓
McpServer.handleSpawnAgent()
    ↓
ContainerManager.spawnAgent()
    ├─ Create Docker container with Tty, OpenStdin, AttachStdin flags
    ├─ Start container
    └─ Call agentMcpServer.createACPClient(agentId, containerId)
        ↓
    ACPClientManager.createClient()
        ├─ Create new ACPContainerClient
        └─ Call client.initialize()
            ├─ startACPViaExec()
            │  └─ spawn('docker', ['exec', '-i', containerId, 'opencode', 'acp'])
            └─ performHandshake()
               ├─ Send initialize request
               ├─ Wait 2s
               ├─ Send session/new request
               └─ Wait 3s
```

**Key Files:**
- `packages/server/src/docker/container-manager.ts` (lines 116-124)
- `packages/server/src/acp/acp-client-manager.ts` (lines 8-23)
- `packages/server/src/acp/acp-container-client.ts` (lines 17-28, 30-103)

---

## 2. Message Forwarding to ACP

```
Developer sends message
    ↓
McpServer.handleSendMessage() or Agent sends_message MCP tool
    ↓
MessagingTools.sendMessage()
    ↓
MessageRouter.send(from, to, content, priority)
    ├─ Create Message object
    ├─ Store in JSONL file
    ├─ Add to in-memory cache
    └─ emit("message:sent", message)
        ↓
    AgentMcpServer.handleNewMessage()
        ↓
    ACPMessageForwarder.forwardMessage(message)
        ↓
    ACPClientManager.forwardMessage()
        ↓
    ACPContainerClient.sendPrompt()
        ├─ Create session/prompt request
        └─ Write to docker exec stdin
            ↓
        Agent (OpenCode) processes prompt
            ↓
        Agent responds with agent_message_chunk updates
            ↓
        Agent sends end_turn signal
```

**Event Flow:**
- `MessageRouter` emits `message:sent` event
- `AgentMcpServer` listens (line 41-44)
- `ACPMessageForwarder` routes to ACP client
- Response collected in `ACPContainerClient`
- Response sent back to `MessageRouter.send()`

**Key Files:**
- `packages/server/src/acp/acp-message-forwarder.ts` (lines 13-22)
- `packages/server/src/acp/acp-container-client.ts` (lines 154-182)
- `packages/server/src/mcp/agent-mcp-server.ts` (lines 41-80)

---

## 3. Response Handling (Bidirectional)

```typescript
// In acp-container-client.ts (lines 41-85)
this.execProcess.stdout?.on('data', (data) => {
  const lines = data.toString().split('\n');
  lines.forEach((line) => {
    const message = JSON.parse(line);  // ACP JSON-RPC response
    
    // Capture session ID
    if (message.result?.sessionId) {
      this.sessionId = message.result.sessionId;
    }
    
    // Collect response chunks
    if (message.method === 'session/update' && 
        message.params?.update?.sessionUpdate === 'agent_message_chunk') {
      this.currentResponse += message.params.update.content?.text;
    }
    
    // When agent completes
    if (message.result?.stopReason === 'end_turn') {
      // Send response back to message router (BIDIRECTIONAL!)
      this.messageRouter.send({
        from: this.agentId,
        to: 'developer',
        content: this.currentResponse.trim()
      });
      this.currentResponse = '';
    }
  });
});
```

**Key Point:** Responses are collected from ACP chunks and sent back to MessageRouter, which triggers the SSE stream to web UI.

---

## 4. Web UI Message Streaming

```typescript
// In web-server/src/api/events.ts (lines 45-50)
const onMessageSent = messageRouter
  ? (message: Message) => {
      // THIS STREAMS ACP MESSAGES TO DASHBOARD
      res.write(`event: message:sent\n`);
      res.write(`data: ${JSON.stringify(message)}\n\n`);
    }
  : null;

// Register listener
if (messageRouter && onMessageSent) {
  messageRouter.on("message:sent", onMessageSent);  // Listen to ALL messages
}

// Cleanup on disconnect
req.on("close", () => {
  if (messageRouter && onMessageSent) {
    messageRouter.off("message:sent", onMessageSent);
  }
});
```

**Event Types Sent to Web UI:**
1. `event: init` - Initial agent list
2. `event: agent:created` - Agent spawned
3. `event: agent:updated` - Agent status changed
4. `event: agent:removed` - Agent stopped
5. `event: message:sent` - **ACP messages arrive here!**

---

## 5. Message Router Architecture

```typescript
// Message stored in JSONL format
interface Message {
  id: string;              // UUID
  from: string;            // agent-id or 'developer'
  to: string;              // agent-id, 'developer', or 'broadcast'
  content: string;         // Message content
  timestamp: number;       // Unix timestamp (ms)
  read: boolean;          // Read status
  priority: "low" | "normal" | "high";  // Priority level
}

// File structure
./.crowd/sessions/
├── 1730000000000/
│   ├── session.json           // Session metadata
│   └── messages.jsonl         // Append-only message log
└── 1730000001000/
    ├── session.json
    └── messages.jsonl
```

**Event Emission:**
```typescript
// Line 200 in message-router-jsonl.ts
this.emit("message:sent", message);  // Triggers SSE stream
```

---

## 6. Key Integration Points for Dashboard Enhancement

### A. Direct ACP Response Hook (BEST for prioritization)
```typescript
// In acp-container-client.ts, around line 63
if (message.result?.stopReason === 'end_turn') {
  // ENHANCEMENT: Emit ACP-specific event
  this.emit("acp:response:complete", {
    agentId: this.agentId,
    content: this.currentResponse,
    timestamp: Date.now(),
    source: "acp-direct"
  });
  
  // Then send to message router as before
  this.messageRouter.send({...});
}
```

### B. Mark ACP Messages with Metadata
```typescript
// In acp-container-client.ts or acp-message-forwarder.ts
await this.messageRouter.send({
  from: this.agentId,
  to: 'developer',
  content: this.currentResponse,
  priority: 'high',  // Use high priority for ACP responses
  source: 'acp'      // Add new field if extended Message type
});
```

### C. New SSE Event Type for ACP
```typescript
// In web-server/src/api/events.ts
const onACPResponse = (event) => {
  res.write(`event: message:acp\n`);
  res.write(`data: ${JSON.stringify(event)}\n\n`);
};

// Listen to new ACP event
if (acpEventBus) {
  acpEventBus.on("acp:response:complete", onACPResponse);
}
```

---

## 7. Docker Exec ACP Communication

```
MCP Server          Docker Host         Agent Container
     │                  │                      │
     │ spawn process    │                      │
     ├─────────────────>│ docker exec -i       │
     │                  ├─────────────────────>│
     │                  │  (stdin/stdout pipe) │
     │                  │   opencode acp       │
     │                  │                      │ (ACP listening on stdio)
     │                  │  JSON-RPC initialize │
     │                  │<─────────────────────┤
     │  (response)      │                      │
     │<─────────────────┤                      │
     │                  │  JSON-RPC session/new│
     │                  │<─────────────────────┤
     │  (session ID)    │                      │
     │<─────────────────┤                      │
     │                  │ session/prompt       │
     ├─────────────────>│ (message from router)│
     │                  ├─────────────────────>│
     │                  │ Agent processes...   │
     │                  │ session/update       │
     │                  │ (chunks)             │
     │                  │<─────────────────────┤
     │<─────────────────┤                      │
     │ (collect chunks) │                      │
     │                  │ end_turn             │
     │                  │<─────────────────────┤
     │ (send to router) │                      │
```

---

## 8. Critical Code Paths

### Path 1: Agent Spawn → ACP Connection
```
index.ts:254 → McpServer.handleSpawnAgent()
            → container-manager.ts:40 → spawnAgent()
            → container-manager.ts:119 → agentMcpServer.createACPClient()
            → agent-mcp-server.ts:531 → createACPClient()
            → acp-client-manager.ts:8 → createClient()
            → acp-container-client.ts:17 → initialize()
```

### Path 2: Message → ACP Forwarding
```
messaging-tools.ts:95 → MessageRouter.send()
                     → message-router-jsonl.ts:200 → emit("message:sent")
                     → agent-mcp-server.ts:42 → handleNewMessage()
                     → agent-mcp-server.ts:219 → forwardMessage()
                     → acp-message-forwarder.ts:16 → forwardMessage()
                     → acp-client-manager.ts:60 → sendPrompt()
                     → acp-container-client.ts:154 → sendPrompt()
```

### Path 3: ACP Response → Web UI
```
acp-container-client.ts:65 → messageRouter.send()
                           → emit("message:sent")
                           → web-server/events.ts:47 → onMessageSent()
                           → SSE write("event: message:sent\n")
                           → Web Dashboard (real-time update)
```

---

## 9. Testing the ACP Flow

### Check ACP Client Creation
```bash
# Look for logs when agent spawns
docker logs crowd-mcp | grep "ACP client created"
```

### Check Message Forwarding
```bash
# Watch message router events
tail -f ./.crowd/sessions/*/messages.jsonl
```

### Check SSE Stream
```bash
curl -H "Accept: text/event-stream" http://localhost:3000/api/events
```

### Check ACP Session
```bash
# Find exec process
docker ps -a | grep opencode

# Check logs
docker logs <container-id>
```

---

## 10. Future Enhancement Checklist

- [ ] Add `source: "acp"` field to messages from ACP responses
- [ ] Create separate SSE event type `message:acp-response`
- [ ] Implement chunked response streaming (not just final)
- [ ] Add ACP session state visualization
- [ ] Implement WebSocket fallback for SSE
- [ ] Add ACP protocol debugging in development mode
- [ ] Create agent response streaming with typing effect
- [ ] Add message batching for SSE efficiency

