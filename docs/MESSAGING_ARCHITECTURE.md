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
  id: string;                                    // UUID
  from: string;                                  // agent-id or 'developer'
  to: string;                                    // agent-id, 'developer', or 'broadcast'
  content: string;                               // Message content
  timestamp: number;                             // Unix timestamp (ms)
  read: boolean;                                 // Read status
  priority: 'low' | 'normal' | 'high';          // Message priority
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
  getMessages(participantId: string, options?: GetMessagesOptions): Promise<Message[]>;

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
  getStats(): Promise<{ totalMessages: number; unreadMessages: number; totalParticipants: number }>;

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

### 3. Agent MCP Server (SSE Transport) - 🚧 NOT YET IMPLEMENTED

**Planned Location**: `packages/server/src/mcp/agent-mcp-server.ts`

**Status**: This component is planned but not yet implemented. Currently, agents would need to interact with the messaging system through the Management Interface or direct HTTP API calls.

**Planned Responsibilities:**
- Bereitstellen von MCP Tools für Agenten in Docker Containern
- SSE-basierte Kommunikation (Server-Sent Events)
- Authentication via agent-specific tokens/keys

**Tools:**

#### `discover_agents`
```typescript
{
  name: 'discover_agents',
  description: 'Discover other active agents',
  inputSchema: {
    capability?: string,  // Filter by capability
    status?: string       // Filter by status
  },
  returns: Agent[]
}
```

#### `send_to_agent`
```typescript
{
  name: 'send_to_agent',
  description: 'Send message to another agent',
  inputSchema: {
    targetAgentId: string,
    message: string,
    priority?: 'low' | 'normal' | 'high'
  },
  returns: { messageId: string, timestamp: number }
}
```

#### `broadcast_message`
```typescript
{
  name: 'broadcast_message',
  description: 'Broadcast message to all agents',
  inputSchema: {
    message: string
  },
  returns: { messageId: string, recipientCount: number }
}
```

#### `get_my_messages`
```typescript
{
  name: 'get_my_messages',
  description: 'Retrieve messages for this agent',
  inputSchema: {
    unreadOnly?: boolean,
    limit?: number,
    since?: number  // timestamp
  },
  returns: Message[]
}
```

#### `update_my_status`
```typescript
{
  name: 'update_my_status',
  description: 'Update this agent\'s status and metadata',
  inputSchema: {
    status?: 'idle' | 'working' | 'blocked',
    capabilities?: string[]
  },
  returns: { success: boolean }
}
```

**Authentication Flow:**
```
1. Agent sends SSE request to Port 3100
   Headers: {
     'X-Agent-ID': 'agent-123',
     'X-Signature': '<base64-signature>',
     'X-Timestamp': '1234567890'
   }
   ↓
2. Agent MCP Server:
   a. Extract agentId from header
   b. Get publicKey from KeyStore
   c. Verify signature: sign(timestamp + requestBody, privateKey)
   ↓
3. If valid:
   - Execute tool
   - Return result
   Else:
   - Return 403 Forbidden
```

### 4. ContainerManager Extension

**Changes to**: `packages/server/src/docker/container-manager.ts`

**New Method: generateKeyPair()**
```typescript
async spawnAgent(config: SpawnAgentConfig): Promise<Agent> {
  // 1. Generate key pair
  const { publicKey, privateKey } = await this.generateKeyPair();

  // 2. Save private key to temp location
  const keyPath = `./.crowd/keys/${config.agentId}/`;
  await fs.mkdir(keyPath, { recursive: true });
  await fs.writeFile(`${keyPath}/private.pem`, privateKey);

  // 3. Mount key into container
  const container = await docker.createContainer({
    name: `agent-${config.agentId}`,
    Image: 'crowd-mcp-agent',
    Env: [
      `AGENT_ID=${config.agentId}`,
      `MCP_SERVER_URL=http://host.docker.internal:3100`,
      `AGENT_KEY_PATH=/agent-keys/private.pem`
    ],
    HostConfig: {
      Binds: [
        `${process.cwd()}:/workspace`,
        `${keyPath}:/agent-keys:ro`  // Read-only mount
      ]
    }
  });

  // 4. Register public key in KeyStore
  await keyStore.registerKey(config.agentId, publicKey);

  // 5. Start container
  await container.start();

  return {
    id: config.agentId,
    task: config.task,
    containerId: container.id,
    status: 'initializing',
    startTime: Date.now()
  };
}

private async generateKeyPair(): Promise<{ publicKey: string, privateKey: string }> {
  return new Promise((resolve, reject) => {
    crypto.generateKeyPair('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    }, (err, publicKey, privateKey) => {
      if (err) reject(err);
      else resolve({ publicKey, privateKey });
    });
  });
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
const crypto = require('crypto');
const fs = require('fs');

const privateKey = fs.readFileSync(process.env.AGENT_KEY_PATH, 'utf8');
const agentId = process.env.AGENT_ID;

function signRequest(data) {
  const sign = crypto.createSign('SHA256');
  sign.update(data);
  sign.end();
  return sign.sign(privateKey, 'base64');
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
- ⚠️ Currently no per-agent access control (requires Agent MCP Server)

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

**Phase 2: Agent Interface** 🚧 **TODO**
- 🔜 Agent MCP Server (SSE transport)
- 🔜 Agent authentication/authorization
- 🔜 Key generation and management

**Phase 3: Advanced Features** (Future)
- Message encryption (E2E)
- Message TTL/cleanup
- Export functionality (CSV, JSON, Parquet)
- Key rotation
- Message search and filtering UI
