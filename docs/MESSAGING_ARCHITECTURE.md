# Messaging System Architecture

## Overview

Das Messaging-System ermöglicht die Kommunikation zwischen Agenten über einen zentralen Message Broker (MCP Server). Alle Nachrichten werden persistent in JSONL-Dateien gespeichert, organisiert nach Session-Ordnern.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    MCP Server Process (index.ts)                 │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ 1. Management MCP Server (stdio)                           │ │
│  │    - Für: Claude Desktop / MCP Host                        │ │
│  │    - Transport: StdioServerTransport                       │ │
│  │    - Tools: spawn_agent, list_agents, stop_agent           │ │
│  │    - Port: stdio (stdin/stdout)                            │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ 2. Agent MCP Server (SSE/HTTP)                      ⭐ NEW  │ │
│  │    - Für: Agenten in Docker Containern                     │ │
│  │    - Transport: SSEServerTransport                         │ │
│  │    - Tools:                                                │ │
│  │      * discover_agents    - Andere Agenten finden          │ │
│  │      * send_to_agent      - Nachricht senden               │ │
│  │      * broadcast_message  - Broadcast an alle              │ │
│  │      * get_my_messages    - Nachrichten abrufen            │ │
│  │      * update_my_status   - Status aktualisieren           │ │
│  │    - Port: 3100 (konfigurierbar via AGENT_MCP_PORT)        │ │
│  │    - Auth: Public Key Signature Verification               │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ 3. HTTP Server (Express)                                   │ │
│  │    - Web Dashboard (für Operatoren)                        │ │
│  │    - Routes: /api/agents, /api/events (SSE)                │ │
│  │    - Port: 3000 (konfigurierbar via HTTP_PORT)             │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ 4. Core Components                               ⭐ NEW     │ │
│  │    ┌────────────────────────────────────────────────────┐  │ │
│  │    │ MessageRouter (JSONL File-based)                   │  │ │
│  │    │  - Location: ./.crowd/sessions/{timestamp}/        │  │ │
│  │    │  - messages.jsonl (append-only message log)        │  │ │
│  │    │  - session.json (session metadata)                 │  │ │
│  │    │  - send(from, to, content)                         │  │ │
│  │    │  - broadcast(from, content)                        │  │ │
│  │    │  - getMessages(participantId, options)             │  │ │
│  │    │  - markAsRead(messageIds[])                        │  │ │
│  │    └────────────────────────────────────────────────────┘  │ │
│  │    ┌────────────────────────────────────────────────────┐  │ │
│  │    │ AgentRegistry (EventEmitter)                       │  │ │
│  │    │  - Erweitert um: status, capabilities, startTime   │  │ │
│  │    │  - Events: agent:created, agent:updated, removed   │  │ │
│  │    └────────────────────────────────────────────────────┘  │ │
│  │    ┌────────────────────────────────────────────────────┐  │ │
│  │    │ ContainerManager                                   │  │ │
│  │    │  - Erweitert um: Key-Pair Generation beim Spawn    │  │ │
│  │    │  - Mount Private Key in Container                  │  │ │
│  │    └────────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                    │                              │
                    │ Docker API                   │ SSE/HTTP
                    ▼                              ▼
         ┌────────────────────┐         ┌──────────────────┐
         │ Agent Container-1  │         │ Agent Container-2│
         │ ┌────────────────┐ │         │ ┌──────────────┐ │
         │ │ MCP Client     │ │         │ │ MCP Client   │ │
         │ │ (OpenCode)     │ │         │ │ (OpenCode)   │ │
         │ └────────┬───────┘ │         │ └──────┬───────┘ │
         │          │ ↑       │         │        │ ↑       │
         │          │ │       │         │        │ │       │
         │ Private  │ │ Signiert       │Private │ │ Signiert
         │ Key      │ │ Requests       │Key     │ │ Requests
         │ (mounted)│ │       │         │(mounted)│ │       │
         └──────────┴─┴───────┘         └────────┴─┴───────┘
                    │                              │
                    └──────────────┬───────────────┘
                                   │
                            ┌──────▼───────┐
                            │  Workspace   │
                            │  (Shared)    │
                            └──────────────┘
```

## Component Details

### 1. MessageRouter (JSONL File-based)

**Location**: `packages/server/src/core/message-router-jsonl.ts`

**Responsibilities:**

- Persistente Speicherung aller Nachrichten in JSONL-Dateien
- Session-basierte Ordnerstruktur für einfaches Debugging
- Nachrichtenverteilung zwischen Agenten und Developer
- Prioritäts-basiertes Queuing
- In-Memory-Cache für schnelle Abfragen

**Message Format (JSONL):**

```typescript
interface Message {
  id: string; // UUID
  from: string; // agent-id or 'developer'
  to: string; // agent-id, 'developer', or 'broadcast'
  content: string; // Message content
  timestamp: number; // Unix timestamp (ms)
  read: boolean; // Read status
  priority: "low" | "normal" | "high"; // Message priority
}
```

**File Structure:**

```
./.crowd/
└── sessions/
    ├── 1730000000000/                          # Session timestamp
    │   ├── session.json                        # Session metadata
    │   └── messages.jsonl                      # Append-only message log
    └── 1730000001000/                          # Another session
        ├── session.json
        └── messages.jsonl
```

**Session Metadata (session.json):**

```json
{
  "sessionId": "1730000000000",
  "startTime": 1730000000000,
  "version": "1.0.0"
}
```

**API:**

```typescript
interface MessageRouter {
  // Initialize session and load messages
  initialize(): Promise<void>;

  // Send direct message or broadcast
  send(options: SendMessageOptions): Promise<Message>;

  // Get messages for participant
  getMessages(
    participantId: string,
    options?: GetMessagesOptions,
  ): Promise<Message[]>;

  // Mark messages as read
  markAsRead(messageIds: string[]): Promise<void>;

  // Participant lifecycle
  registerParticipant(participantId: string): void;
  unregisterParticipant(participantId: string): void;
  getRegisteredParticipants(): string[];

  // Message management
  clearMessages(participantId: string): Promise<void>;
  getMessageStats(participantId: string): Promise<MessageStats>;

  // Global statistics
  getStats(): Promise<{
    totalMessages: number;
    unreadMessages: number;
    totalParticipants: number;
  }>;

  // Session info
  getSessionInfo(): { sessionId: string; sessionDir: string };

  // Cleanup
  close(): Promise<void>;
}
```

### 2. MessagingTools (MCP Tool Implementations)

**Location**: `packages/server/src/mcp/messaging-tools.ts`

**Responsibilities:**

- Provides MCP tool implementations for messaging
- Handles validation and error handling
- Integrates MessageRouter with AgentRegistry

**Available Tools:**

- `send_message` - Send direct or broadcast messages
- `get_messages` - Retrieve messages for a participant
- `mark_messages_read` - Mark messages as read
- `discover_agents` - List all active agents

### 3. Agent MCP Server (SSE Transport) - ✅ IMPLEMENTED

**Location**: `packages/server/src/mcp/agent-mcp-server.ts`

**Status**: ✅ **Fully Implemented and Operational**

Agents running in Docker containers can now communicate with the messaging system through a dedicated SSE-based MCP server.

**Responsibilities:**

- Provides MCP Tools for agents in Docker containers
- SSE-based communication (Server-Sent Events)
- Agent identity management via query parameter
- Independent HTTP server on port 3100 (configurable)

**Endpoints:**

- `GET /sse?agentId=<id>` - Establish SSE connection
- `POST /message/<sessionId>` - Receive messages from agent
- `GET /health` - Health check

**Connection Flow:**

1. Agent starts in Docker container with `AGENT_MCP_URL` environment variable
2. Agent connects to: `http://host.docker.internal:3100/sse?agentId=<id>`
3. Server validates agent exists in registry
4. Creates dedicated MCP server instance for agent
5. Agent can call messaging tools via MCP protocol

**Available Tools for Agents:**

All messaging tools are available through the Agent MCP Server:

#### `send_message`

Send a message to another agent, developer, or broadcast to all

```typescript
{
  to: string;           // agent-id, 'developer', or 'broadcast'
  content: string;      // Message content
  priority?: 'low' | 'normal' | 'high';
}
→ Returns: { success, messageId, to, timestamp, recipientCount }
```

#### `get_messages`

Retrieve messages for the agent

```typescript
{
  unreadOnly?: boolean;   // Only unread messages
  limit?: number;         // Max number of messages
  markAsRead?: boolean;   // Mark as read after retrieval
}
→ Returns: { success, count, unreadCount, messages[] }
```

#### `mark_messages_read`

Mark specific messages as read

```typescript
{
  messageIds: string[];   // Array of message IDs
}
→ Returns: { success, markedCount }
```

#### `discover_agents`

Find other active agents

```typescript
{
  status?: string;       // Filter by status
  capability?: string;   // Filter by capability
}
→ Returns: { success, count, agents[] }
```

**Agent Connection Example:**

From within an agent container, the agent can connect using the MCP SDK:

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

// URL is provided via AGENT_MCP_URL environment variable
const mcpUrl = process.env.AGENT_MCP_URL;
// e.g., "http://host.docker.internal:3100/sse?agentId=agent-123"

const transport = new SSEClientTransport(new URL(mcpUrl));
const client = new Client(
  { name: "my-agent", version: "1.0" },
  { capabilities: {} },
);

await client.connect(transport);

// Now the agent can use messaging tools
const result = await client.request({
  method: "tools/call",
  params: {
    name: "send_message",
    arguments: {
      to: "developer",
      content: "Task completed successfully!",
      priority: "high",
    },
  },
});
```

**Authentication:**
Currently, authentication is handled via the `agentId` query parameter. The server validates that the agent exists in the registry before establishing the connection. Future versions may implement cryptographic authentication.

### 4. ContainerManager Extension ✅ IMPLEMENTED

**Location**: `packages/server/src/docker/container-manager.ts`

**Changes:**

- Constructor now accepts `agentMcpPort` parameter (default: 3100)
- Provides `AGENT_MCP_URL` environment variable to containers

**Current Implementation:**

```typescript
async spawnAgent(config: SpawnAgentConfig): Promise<Agent> {
  // Build Agent MCP Server URL for container
  const agentMcpUrl = `http://host.docker.internal:${this.agentMcpPort}/sse?agentId=${config.agentId}`;

  const container = await this.docker.createContainer({
    name: `agent-${config.agentId}`,
    Image: 'crowd-mcp-agent:latest',
    Env: [
      `AGENT_ID=${config.agentId}`,
      `TASK=${config.task}`,
      `AGENT_MCP_URL=${agentMcpUrl}`,  // ← Agent knows how to connect
    ],
    HostConfig: {
      Binds: [`${config.workspace}:/workspace:rw`],
    },
    Tty: true,
    OpenStdin: true,
  });

  await container.start();

  return {
    id: config.agentId,
    task: config.task,
    containerId: container.id || '',
  };
}
```

### 5. Agent Container Configuration

**Location**: `docker/agent/Dockerfile` (to be updated)

**MCP Client Configuration** (inside container):

```json
{
  "mcpServers": {
    "crowd-mcp-agent": {
      "command": "node",
      "args": ["/agent-tools/mcp-client-wrapper.js"],
      "env": {
        "MCP_SERVER_URL": "http://host.docker.internal:3100",
        "AGENT_KEY_PATH": "/agent-keys/private.pem"
      }
    }
  }
}
```

**Agent Wrapper Script** (`mcp-client-wrapper.js`):

```javascript
// Signs all requests with private key
const crypto = require("crypto");
const fs = require("fs");

const privateKey = fs.readFileSync(process.env.AGENT_KEY_PATH, "utf8");
const agentId = process.env.AGENT_ID;

function signRequest(data) {
  const sign = crypto.createSign("SHA256");
  sign.update(data);
  sign.end();
  return sign.sign(privateKey, "base64");
}

// Intercept all MCP requests and add signature
// ... implementation
```

## Data Flow: Message Sending

```
┌─────────────┐
│ Agent-1     │
│ Container   │
└──────┬──────┘
       │
       │ 1. send_to_agent(target='agent-2', message='Hello')
       │    + Signature with Private Key
       ▼
┌──────────────────────────────────────┐
│ Agent MCP Server (Port 3100)         │
│                                      │
│ 2. Verify Signature                  │
│    KeyStore.verifySignature(...)     │
│                                      │
│ 3. If valid:                         │
│    MessageRouter.send({              │
│      from: 'agent-1',                │
│      to: 'agent-2',                  │
│      content: 'Hello'                │
│    })                                │
└──────────────┬───────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│ MessageRouter                        │
│                                      │
│ 4. Append to JSONL file:             │
│    {"id":"msg-xyz",                  │
│     "from":"agent-1",                │
│     "to":"agent-2",                  │
│     "content":"Hello",               │
│     "timestamp":1234567890,          │
│     "read":false,                    │
│     "priority":"normal"}             │
│    → messages.jsonl                  │
└──────────────┬───────────────────────┘
               │
               │ 5. Return messageId
               ▼
┌──────────────────────────────────────┐
│ Agent-1: Receives confirmation       │
│ { messageId: 'msg-xyz' }             │
└──────────────────────────────────────┘
```

## Data Flow: Message Retrieval

```
┌─────────────┐
│ Agent-2     │
│ Container   │
└──────┬──────┘
       │
       │ 1. get_my_messages(unreadOnly=true)
       │    + Signature
       ▼
┌──────────────────────────────────────┐
│ Agent MCP Server (Port 3100)         │
│                                      │
│ 2. Verify Signature                  │
│                                      │
│ 3. MessageRouter.getMessages(        │
│      agentId: 'agent-2',             │
│      options: { unreadOnly: true }   │
│    )                                 │
└──────────────┬───────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│ MessageRouter (JSONL)                │
│                                      │
│ 4. SELECT * FROM messages            │
│    WHERE to_agent = 'agent-2'        │
│      AND read = false                │
│    ORDER BY priority DESC,           │
│              timestamp ASC            │
└──────────────┬───────────────────────┘
               │
               │ 5. Return messages
               ▼
┌──────────────────────────────────────┐
│ Agent-2: Receives messages           │
│ [                                    │
│   {                                  │
│     id: 'msg-xyz',                   │
│     from: 'agent-1',                 │
│     content: 'Hello',                │
│     timestamp: 1234567890,           │
│     priority: 'normal'               │
│   }                                  │
│ ]                                    │
└──────────────────────────────────────┘
```

## Configuration

**Environment Variables:**

```bash
# HTTP Server (Web Dashboard)
HTTP_PORT=3000                    # Default: 3000

# Agent MCP Server
AGENT_MCP_PORT=3100              # Default: 3100

# Database
CROWD_SESSIONS_DIR=./.crowd/sessions  # Default: ./.crowd/sessions
SESSION_ID=                            # Optional: auto-generated timestamp if not set
```

## Security Considerations

### 1. Agent Authentication - 🚧 TODO

Currently not implemented. Planned features:

- 🔜 Asymmetric Key Pairs (RSA-2048)
- 🔜 Private Keys nur in Agent Containers
- 🔜 Public Keys im MCP Server
- 🔜 Signatur-Verifizierung bei jedem Request

### 2. Container Isolation

- ✅ Agents run in isolated Docker containers
- ✅ No direct agent-to-agent connections
- ✅ All communication via MCP Server

### 3. Message Security

- ⚠️ Messages are not encrypted (Future: E2E Encryption)
- ✅ Messages only through MCP Server
- ✅ Agent identity managed via Agent MCP Server
- ⚠️ Basic authentication via query parameter (cryptographic auth planned)

## Data Format and Export - 🚧 Future Feature

**Purpose:**

- Analytische Auswertungen
- Long-term Storage
- Integration mit Data Analytics Tools

**Current approach:**

- JSONL files are already portable and analyzable
- Each line is a valid JSON object (Message)
- Can be easily imported into analytics tools
- Future: Add export functionality if needed

## Testing Strategy

### Unit Tests ✅

- ✅ MessageRouter: CRUD operations, filtering, sorting (23 tests)
- ✅ MessagingTools: All tool methods (19 tests)
- ✅ JSONL persistence and session management

### Integration Tests ✅

- ✅ Message send → Store → Retrieve flow
- ✅ Persistence across restarts
- ⊘ Agent spawn tests (require Docker, skipped when unavailable)

### Manual Tests

- Spawn agents via Management Interface
- Send messages between developer and agents
- Broadcast messages to all agents
- Verify message persistence in .crowd/sessions/

## Implementation Status

**Phase 1: Core Implementation** ✅ **COMPLETE**

- ✅ Message types (shared package)
- ✅ MessageRouter with JSONL storage
- ✅ MessagingTools (MCP tool implementations)
- ✅ Integration into index.ts
- ✅ Session-based folder structure

**Phase 2: Agent Interface** ✅ **COMPLETE**

- ✅ Agent MCP Server (SSE transport on port 3100)
- ✅ Agent identity management via query parameter
- ✅ Container environment variable configuration
- ⏳ Cryptographic authentication (planned for future)

**Phase 3: Task Delivery Optimization** ✅ **COMPLETE**

- ✅ Messaging-based task delivery (replaces SSE notifications)
- ✅ Stdin-based startup commands for immediate task retrieval
- ✅ Reliable task delivery with OpenCode's lazy loading behavior
- ✅ Enhanced error logging for task delivery debugging

### Task Delivery Architecture

#### Flow

1. **Agent Spawn** → Task sent to agent's message inbox via messaging system
2. **Container Startup** → entrypoint.sh sends "get your messages" to OpenCode via stdin
3. **Immediate Retrieval** → Agent executes `get_messages` MCP tool automatically
4. **Task Processing** → Agent processes task through normal OpenCode workflow
5. **Completion Notification** → Agent reports completion to developer via `send_message` (automatically instructed)

#### Implementation Details

**Task Injection (mcp-server.ts)**:

```typescript
// Send task with completion instruction to agent's inbox during spawn
const messageResult = await this.messagingTools.sendMessage({
  from: DEVELOPER_ID,
  to: agent.id,
  content: `**Initial Task Assignment:**

${task}

---

**📋 Instructions:**
Once you complete this task, please send a message to 'developer' using the send_message MCP tool to report your completion status and any results.`,
  priority: "high",
});
```

**Startup Command (entrypoint.sh)**:

```bash
# Send initial command via stdin
printf "get your messages\n" | exec opencode --agent "$AGENT_TYPE"
```

**Benefits**:

- ✅ **Reliable**: No dependency on MCP connection timing
- ✅ **Immediate**: Task available right on startup
- ✅ **Persistent**: Uses robust JSONL message storage
- ✅ **Automated Completion**: Agents automatically instructed to report completion
- ✅ **Compatible**: Works with OpenCode's architecture

**Phase 4: Advanced Features** (Future)

- Message encryption (E2E)
- Message TTL/cleanup
- Export functionality (CSV, JSON, Parquet)
- Key rotation
- Message search and filtering UI
