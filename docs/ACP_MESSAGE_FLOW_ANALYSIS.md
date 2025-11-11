# ACP Message Flow Architecture Report
## crowd-mcp Backend Analysis

**Date:** 2025-11-11  
**Branch:** claude/prioritize-acp-messages-dashboard-011CV2S4vEx2paHTm1Ck3KRa  
**Focus:** Understanding ACP message flow and integration points for web UI streaming

---

## Executive Summary

The crowd-mcp backend implements an **Agent Client Protocol (ACP) based message delivery system** that replaces traditional stdin-based communication. The architecture uses Docker exec with stdin to create persistent ACP connections to agent containers, enabling bidirectional message exchange through a message router that feeds into the web UI.

**Key Finding:** The system is designed to prioritize ACP messages over container logs, with multiple integration points for streaming messages to the web UI via Server-Sent Events (SSE).

---

## 1. Current Architecture Overview

### Component Interaction Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         MCP Server (index.ts)                  │
├─────────────┬──────────────────────┬────────────────────────────┤
│             │                      │                            │
│  Management │ Agent MCP Server     │  HTTP Server (Express)     │
│  Interface  │ (Streamable HTTP     │                            │
│  (stdio)    │  Port 3100)          │  Port 3000                 │
│             │                      │                            │
└─────────────┴──────┬───────────────┴───────────┬────────────────┘
                     │                           │
        ┌────────────┴─────────────┐  ┌──────────▼──────────┐
        │    MessageRouter         │  │  AgentRegistry      │
        │  (JSONL File-based)      │  │  (EventEmitter)     │
        │  ./.crowd/sessions/      │  │                     │
        └────────────┬─────────────┘  └──────────┬──────────┘
                     │                           │
        ┌────────────┴─────────────────────────┐ │
        │   AgentMcpServer                    │ │
        │ ┌──────────────────────────────────┐ │ │
        │ │  ACPClientManager                │ │ │
        │ │  ACPMessageForwarder             │ │ │
        │ │  StreamableHttpTransport (SSE)   │ │ │
        │ └──────────┬───────────────────────┘ │ │
        └────────────┼─────────────────────────┘ │
                     │                           │
   ┌─────────────────┴──────────────┐  ┌────────▼──────────┐
   │   ACP Connections              │  │  WebSocket Events │
   │   (Docker exec -i)             │  │  SSE Streams      │
   │                                │  │                   │
   │  Agent-1 ↔ ACP ↔ MCP Server   │  │  Web Dashboard    │
   │  Agent-2 ↔ ACP ↔ MCP Server   │  │  Real-time UI     │
   │  Agent-3 ↔ ACP ↔ MCP Server   │  │                   │
   └────────────────────────────────┘  └───────────────────┘
```

---

## 2. Where ACP Clients Are Created

### File: `/home/user/crowd-mcp/packages/server/src/docker/container-manager.ts` (Lines 116-124)

**Location:** `ContainerManager.spawnAgent()` method

```typescript
// Create ACP client for the container if AgentMcpServer is available
if (this.agentMcpServer) {
  try {
    await this.agentMcpServer.createACPClient(config.agentId, container.id || "");
  } catch (error) {
    // Log error but don't fail container creation - ACP is optional
    console.error(`Failed to create ACP client for agent ${config.agentId}:`, error);
  }
}
```

**Trigger:** When a new agent is spawned:
1. Container is created and started with proper flags (TTY, OpenStdin, AttachStdin)
2. AgentMcpServer's `createACPClient()` is called with agent ID and container ID
3. ACPClientManager creates a new ACPContainerClient
4. ACPContainerClient initializes the ACP connection via `docker exec -i`

**Container Setup:**
```typescript
const container = await this.docker.createContainer({
  name: `agent-${config.agentId}`,
  Image: "crowd-mcp-agent:latest",
  Env: containerEnv,
  HostConfig: {
    Binds: binds,
  },
  // Essential flags for ACP stdin communication
  Tty: true,        // Allocate pseudo-TTY for interactive tools
  OpenStdin: true,  // Keep stdin open for ACP communication
  AttachStdin: true, // Attach to stdin at creation time
});
```

---

## 3. How ACP Clients Communicate with Agents

### File: `/home/user/crowd-mcp/packages/server/src/acp/acp-container-client.ts`

### Key Methods:

#### 3.1 Initialization Flow (Lines 17-28)

```typescript
async initialize(): Promise<void> {
  try {
    console.log(`🔌 Initializing ACP client for agent ${this.agentId}`);
    await this.startACPViaExec();      // Start Docker exec process
    await this.performHandshake();      // ACP handshake
    this.isInitialized = true;
  } catch (error) {
    throw new Error(`Failed to initialize ACP client`);
  }
}
```

#### 3.2 Docker Exec Approach (Lines 30-103)

Uses `docker exec -i` to maintain persistent stdin connection:

```typescript
this.execProcess = spawn('docker', [
  'exec', '-i',  // Interactive stdin
  this.containerId,
  'opencode', 'acp'  // Start OpenCode in ACP mode
]);
```

**Critical Detail:** This uses stdio-based ACP transport, not the MCP server's streamable HTTP. Direct RPC communication over stdin pipes.

#### 3.3 Message Handling (Lines 41-85)

Listens for ACP responses on stdout:

```typescript
this.execProcess.stdout?.on('data', (data) => {
  const lines = data.toString().split('\n').filter((line: string) => line.trim());
  lines.forEach((line: string) => {
    try {
      const message = JSON.parse(line);
      
      // Capture session ID
      if (message.result?.sessionId) {
        this.sessionId = message.result.sessionId;
      }
      
      // Handle streaming agent responses
      if (message.method === 'session/update' && 
          message.params?.update?.sessionUpdate === 'agent_message_chunk') {
        const content = message.params.update.content?.text || '';
        this.currentResponse += content;
      }
      
      // Handle completion
      if (message.result?.stopReason === 'end_turn') {
        // Send agent response back to message router
        if (this.currentResponse.trim() && this.messageRouter) {
          this.messageRouter.send({
            from: this.agentId,
            to: 'developer',
            content: this.currentResponse.trim()
          });
        }
      }
    } catch (e) {
      console.log(`Raw:`, line);
    }
  });
});
```

**ACP Protocol Details:**
- Uses JSON-RPC 2.0 format
- Session-based communication (session/new, session/prompt, session/update)
- Supports streaming responses with `agent_message_chunk` updates

---

## 4. Message Routing and Forwarding

### File: `/home/user/crowd-mcp/packages/server/src/acp/acp-message-forwarder.ts`

**Single responsibility:** Forward messages from MessageRouter to ACP clients

```typescript
async forwardMessage(message: Message): Promise<void> {
  // Only forward to agent recipients that have ACP clients
  if (message.to.startsWith('agent-') && 
      this.acpClientManager.hasClient(message.to)) {
    await this.acpClientManager.forwardMessage(message.to, {
      content: message.content,
      from: message.from,
      timestamp: message.timestamp
    });
  }
}
```

### Message Router Integration

**File:** `/home/user/crowd-mcp/packages/server/src/mcp/agent-mcp-server.ts` (Lines 41-44, 63-80)

Two event listeners on MessageRouter:

```typescript
// 1. Direct message forwarding
this.messageRouter.on("message:sent", async (message) => {
  await this.handleNewMessage(message);
});

// 2. Message router event forwarding
this.messageRouter.on("message:sent", async (event) => {
  const { message } = event;
  
  if (message && message.to && 
      message.to.startsWith("agent-") && 
      message.from !== message.to) {
    try {
      await this.acpMessageForwarder.forwardMessage(message);
    } catch (error) {
      await this.logger.error("Failed to forward message via ACP", 
        { error, messageId: message.id });
    }
  }
});
```

**Flow:**
1. Message created in MessageRouter via `send()` or `broadcast()`
2. MessageRouter emits `message:sent` event
3. Event caught by AgentMcpServer
4. ACPMessageForwarder routes to correct ACP client
5. ACPContainerClient sends via `session/prompt`
6. Agent processes and responds
7. Response collected and sent back to MessageRouter (bidirectional!)

---

## 5. Message Router Architecture

### File: `/home/user/crowd-mcp/packages/server/src/core/message-router-jsonl.ts`

**Storage:** JSONL files in `./.crowd/sessions/{sessionId}/messages.jsonl`

**Key Features:**
- Persistent file-based storage
- In-memory cache for fast lookups
- EventEmitter for real-time events
- Priority-based message sorting (high > normal > low)
- Support for direct messages and broadcasts

**Message Structure:**
```typescript
interface Message {
  id: string;                                    // UUID
  from: string;                                  // agent-id or 'developer'
  to: string;                                    // agent-id, 'developer', or 'broadcast'
  content: string;                               // Message content
  timestamp: number;                             // Unix timestamp (ms)
  read: boolean;                                 // Read status
  priority: "low" | "normal" | "high";          // Message priority
}
```

**API Event Emission:**
```typescript
// Line 200 - Emits when message is stored
this.emit("message:sent", message);
```

**Registered Participants:**
- Developer (DEVELOPER_ID)
- Each spawned agent (agent-{timestamp})
- Broadcast target (special handling)

---

## 6. How the Message Router Integrates with ACP

### Integration Points:

#### 6.1 Participant Registration
**File:** `/home/user/crowd-mcp/packages/server/src/index.ts` (Lines 84-90)

```typescript
// Register developer as participant
messageRouter.registerParticipant(DEVELOPER_ID);

// Listen for agent creation
registry.on("agent:created", (agent) => {
  messageRouter.registerParticipant(agent.id);
});

// Listen for agent removal
registry.on("agent:removed", (agent) => {
  messageRouter.unregisterParticipant(agent.id);
});
```

#### 6.2 Message Event Forwarding
**File:** `agent-mcp-server.ts` (Lines 41-44)

```typescript
// Listen for new messages and forward to agents via ACP
this.messageRouter.on("message:sent", async (message) => {
  await this.handleNewMessage(message);
});
```

#### 6.3 Response Handling
**File:** `acp-container-client.ts` (Lines 61-76)

```typescript
// When agent completes response, send back to message router
if (message.result?.stopReason === 'end_turn') {
  if (this.currentResponse.trim() && this.messageRouter) {
    // Send agent response back to developer via message router
    this.messageRouter.send({
      from: this.agentId,
      to: 'developer',
      content: this.currentResponse.trim()
    }).then(() => {
      console.log(`Sent response back to developer via message router`);
    });
  }
  this.currentResponse = '';
}
```

**Bidirectional Flow:**
```
Developer → send_message MCP tool
         ↓
MessageRouter.send() → emit "message:sent"
         ↓
ACPMessageForwarder → ACPContainerClient
         ↓
Agent (via ACP session/prompt)
         ↓
Agent processes task...
         ↓
Agent response collected
         ↓
MessageRouter.send() (back to developer)
         ↓
emit "message:sent" → triggers Web UI SSE stream
```

---

## 7. Web UI Integration Points

### File: `/home/user/crowd-mcp/packages/web-server/src/api/events.ts`

**Server-Sent Events (SSE) Endpoint:** `/api/events`

```typescript
router.get("/", (req: Request, res: Response) => {
  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  // Send initial agents list
  const agents = registry.listAgents();
  res.write(`event: init\n`);
  res.write(`data: ${JSON.stringify({ agents })}\n\n`);

  // Event handlers
  const onMessageSent = messageRouter
    ? (message: Message) => {
        // THIS IS WHERE ACP MESSAGES STREAM TO WEB UI!
        res.write(`event: message:sent\n`);
        res.write(`data: ${JSON.stringify(message)}\n\n`);
      }
    : null;

  // Register listener
  if (messageRouter && onMessageSent) {
    messageRouter.on("message:sent", onMessageSent);
  }

  // Cleanup on disconnect
  req.on("close", () => {
    if (messageRouter && onMessageSent) {
      messageRouter.off("message:sent", onMessageSent);
    }
  });
});
```

**Stream Types:**
1. `event: init` - Initial agent state
2. `event: agent:created` - New agent spawned
3. `event: agent:updated` - Agent status changed
4. `event: agent:removed` - Agent stopped
5. `event: message:sent` - **ACP message arrives!**

### File: `/home/user/crowd-mcp/packages/web-server/src/api/messages.ts`

**REST API Endpoints for Messages:**
- `GET /api/messages` - List all or filtered messages
- `GET /api/messages/stats` - Message statistics
- `GET /api/messages/threads` - Organized by participant

---

## 8. Where to Add Hooks for Web UI Streaming

### Current Hooks Available:

1. **MessageRouter Event Hook** ✅
   - **Location:** `MessageRouter.emit("message:sent", message)`
   - **When:** Every time a message is stored (including ACP responses)
   - **Consumer:** SSE endpoint in web-server
   - **Status:** Already connected to web UI via events.ts

2. **ACP Response Hook** (Best location for ACP-specific messages)
   - **Location:** `acp-container-client.ts` lines 61-76
   - **When:** Agent completes response (end_turn received)
   - **Current Action:** Sends back to MessageRouter → then to Web UI
   - **Enhancement Opportunity:** Add separate hook before MessageRouter.send()

3. **ACP Message Forwarding Hook**
   - **Location:** `acp-message-forwarder.ts`
   - **When:** Message about to be forwarded to ACP client
   - **Enhancement Opportunity:** Emit event for tracking message dispatch

4. **AgentMcpServer Processing Hook**
   - **Location:** `agent-mcp-server.ts` lines 41-44
   - **When:** Message routed through MCP server
   - **Current Action:** Logs via McpLogger
   - **Enhancement Opportunity:** Add event emission for message processing

### Recommended Implementation Strategy

**To prioritize ACP messages in dashboard:**

```typescript
// In acp-container-client.ts, when agent completes response:

// Option 1: Emit separate event for ACP responses (high priority)
this.emit("acp:response", {
  agentId: this.agentId,
  content: this.currentResponse,
  timestamp: Date.now(),
  source: "acp-direct"
});

// Option 2: Send to message router with high priority
this.messageRouter.send({
  from: this.agentId,
  to: 'developer',
  content: this.currentResponse,
  priority: 'high'  // Mark as ACP message
});

// Option 3: Emit both for dual streaming
// - Direct SSE for real-time ACP updates (low latency)
// - MessageRouter for persistent storage (reliability)
```

---

## 9. Existing Integration Between Server and Web-Server

### Entry Point
**File:** `/home/user/crowd-mcp/packages/server/src/index.ts` (Lines 96-112)

```typescript
// Start HTTP server for web UI
try {
  await createHttpServer(registry, docker, httpPort, messageRouter);
  console.error(`✓ HTTP server started successfully`);
  console.error(`  Web Dashboard: http://localhost:${httpPort}`);
  console.error(`  API Endpoint: http://localhost:${httpPort}/api/agents`);
  console.error(`  Messages API: http://localhost:${httpPort}/api/messages`);
} catch (error) {
  // Error handling...
}
```

### Web Server Setup
**File:** `/home/user/crowd-mcp/packages/web-server/src/server.ts`

```typescript
export async function createHttpServer(
  registry: AgentRegistry,
  docker: Dockerode,
  port: number,
  messageRouter?: MessageRouterInterface,
): Promise<Server> {
  const app: Application = express();

  // Create log streamer service
  const logStreamer = new AgentLogStreamer(registry, docker);

  // Mount API routes
  app.use("/api/agents", createAgentsRouter(registry, logStreamer));
  app.use("/api/events", createEventsRouter(registry, messageRouter));
  
  // Mount messages API if MessageRouter is provided
  if (messageRouter) {
    app.use("/api/messages", createMessagesRouter(messageRouter));
  }
  // ...
}
```

### Data Flow to Web UI:

```
ACP Messages
    ↓
MessageRouter.send() 
    ↓
emit("message:sent")
    ↓
SSE endpoint (/api/events)
    ↓
Web Dashboard (real-time)
```

**All connected components:**
1. **AgentRegistry** - Agent lifecycle (create, update, remove)
2. **MessageRouter** - Message persistence and events
3. **StreamableHttpTransport** - Session management
4. **AgentMcpServer** - ACP client management
5. **Express HTTP Server** - Web UI endpoints

---

## 10. Current Priorities and Status

### Completed:
- ✅ ACP client creation and initialization
- ✅ Docker exec-based ACP communication
- ✅ Message forwarding from MessageRouter to ACP
- ✅ Bidirectional message exchange (agent responses back to MessageRouter)
- ✅ Web UI event streaming via SSE
- ✅ Message persistence in JSONL format

### In Progress:
- ⏳ ACP message prioritization in dashboard
- ⏳ Real-time streaming optimization

### Future Enhancements:
- 🔜 Direct ACP-to-WebSocket streaming (bypass MessageRouter for low-latency)
- 🔜 ACP session state visualization in dashboard
- 🔜 Agent response streaming (chunked updates instead of final only)
- 🔜 Message encryption for sensitive ACP prompts

---

## 11. Key Files Summary

| File | Purpose | Key Lines |
|------|---------|-----------|
| `packages/server/src/acp/acp-client-manager.ts` | Manages ACP client lifecycle | 8-23 (creation) |
| `packages/server/src/acp/acp-container-client.ts` | Direct ACP communication via docker exec | 30-103 (initialization) |
| `packages/server/src/acp/acp-message-forwarder.ts` | Routes messages to ACP clients | 13-22 (forwarding) |
| `packages/server/src/mcp/agent-mcp-server.ts` | Integrates ACP with message router | 41-80 (event handling) |
| `packages/server/src/docker/container-manager.ts` | Creates containers with ACP support | 116-124 (ACP creation) |
| `packages/server/src/core/message-router-jsonl.ts` | Persistent message storage | 200 (event emission) |
| `packages/server/src/index.ts` | Main MCP server setup | 84-112 (integration) |
| `packages/web-server/src/api/events.ts` | SSE endpoint for web UI | 45-50 (message streaming) |
| `packages/web-server/src/server.ts` | HTTP server setup | 31-56 (routing) |

---

## 12. Recommendations for Next Steps

### 1. Immediate (Dashboard ACP Message Prioritization)
- Add `source: "acp"` field to messages sent from acp-container-client.ts
- Create separate SSE event type: `event: message:acp-response`
- Dashboard can render ACP messages differently (distinct color, position, etc.)

### 2. Short Term (Real-time Streaming)
- Add agent response streaming: emit chunks as they arrive (session/update events)
- Create new SSE event: `event: message:chunk` for partial responses
- Display typing effect in dashboard for agent responses

### 3. Medium Term (Performance)
- Implement WebSocket fallback for SSE (some proxies drop SSE connections)
- Add message batching to reduce SSE overhead
- Implement client-side message deduplication

### 4. Long Term (Advanced Features)
- Direct ACP session visualization (show session state, token usage)
- Agent performance metrics (response time, token count)
- ACP protocol debugging console for development

---

## Conclusion

The crowd-mcp system has a well-architected ACP integration with clear message flow from agent responses through the MessageRouter to the web UI via SSE. All infrastructure for streaming ACP messages to the dashboard is already in place. The system is ready for dashboard enhancements to prioritize and visually distinguish ACP messages from container logs.

