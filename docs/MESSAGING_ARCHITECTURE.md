# Messaging System Architecture

## Overview

Das Messaging-System ermöglicht die Kommunikation zwischen Agenten über einen zentralen Message Broker (MCP Server). Alle Nachrichten werden persistent in einer Parquet-Datenbank gespeichert und über DuckDB verwaltet.

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
│  │    │ MessageRouter (DuckDB + Parquet)                   │  │ │
│  │    │  - DB Location: ./.crowd/db/messages.db            │  │ │
│  │    │  - Parquet Export: ./.crowd/db/messages.parquet    │  │ │
│  │    │  - send(from, to, content)                         │  │ │
│  │    │  - broadcast(from, content)                        │  │ │
│  │    │  - getMessages(agentId, options)                   │  │ │
│  │    │  - markRead(messageId)                             │  │ │
│  │    └────────────────────────────────────────────────────┘  │ │
│  │    ┌────────────────────────────────────────────────────┐  │ │
│  │    │ KeyStore (Public Key Management)         ⭐ NEW     │  │ │
│  │    │  - Speichert Public Keys aller Agenten             │  │ │
│  │    │  - Verifiziert Signaturen bei Agent-Requests       │  │ │
│  │    │  - registerKey(agentId, publicKey)                 │  │ │
│  │    │  - verifySignature(agentId, data, signature)       │  │ │
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

### 1. MessageRouter (DuckDB + Parquet)

**Location**: `packages/server/src/core/message-router.ts`

**Responsibilities:**
- Persistente Speicherung aller Nachrichten in DuckDB
- Periodischer Export nach Parquet
- Nachrichtenverteilung zwischen Agenten
- Prioritäts-basiertes Queuing

**Database Schema:**
```sql
CREATE TABLE messages (
  id VARCHAR PRIMARY KEY,
  from_agent VARCHAR NOT NULL,
  to_agent VARCHAR NOT NULL,
  content TEXT NOT NULL,
  timestamp BIGINT NOT NULL,
  read BOOLEAN DEFAULT false,
  priority VARCHAR CHECK (priority IN ('low', 'normal', 'high')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_to_agent ON messages(to_agent);
CREATE INDEX idx_timestamp ON messages(timestamp);
CREATE INDEX idx_read ON messages(read);
```

**File Structure:**
```
./.crowd/
└── db/
    ├── messages.db         # DuckDB database file
    └── messages.parquet    # Periodic export (für Analytics)
```

**API:**
```typescript
interface MessageRouter {
  // Send direct message
  send(options: SendMessageOptions): Promise<Message>;

  // Broadcast to all agents
  broadcast(from: string, content: string): Promise<string[]>;

  // Get messages for agent
  getMessages(agentId: string, options: GetMessagesOptions): Message[];

  // Mark messages as read
  markRead(messageId: string): boolean;

  // Agent lifecycle
  registerAgent(agentId: string): void;
  unregisterAgent(agentId: string): void;

  // Export to Parquet
  exportToParquet(): Promise<void>;

  // Statistics
  getStats(): MessageStats;
}
```

### 2. KeyStore (Agent Authentication)

**Location**: `packages/server/src/core/key-store.ts`

**Responsibilities:**
- Speichert Public Keys aller gespawnten Agenten
- Verifiziert Signaturen von Agent-Requests
- Key-Rotation Support (future)

**Key Generation Flow:**
```
1. spawn_agent aufgerufen
   ↓
2. ContainerManager generiert Key-Pair (RSA-2048)
   ↓
3. Private Key → in Container gemountet (./.agent-keys/private.pem)
   ↓
4. Public Key → KeyStore.registerKey(agentId, publicKey)
   ↓
5. Agent started mit Private Key
```

**API:**
```typescript
interface KeyStore {
  // Register public key for agent
  registerKey(agentId: string, publicKey: string): void;

  // Verify request signature
  verifySignature(
    agentId: string,
    data: string,
    signature: string
  ): boolean;

  // Remove key when agent stops
  removeKey(agentId: string): void;

  // Get all registered agents
  getRegisteredAgents(): string[];
}
```

### 3. Agent MCP Server (SSE Transport)

**Location**: `packages/server/src/mcp/agent-mcp-server.ts`

**Responsibilities:**
- Bereitstellen von MCP Tools für Agenten
- SSE-basierte Kommunikation
- Signatur-Verifizierung aller Requests

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
│ 4. Insert into DuckDB:               │
│    INSERT INTO messages VALUES (     │
│      id: 'msg-xyz',                  │
│      from_agent: 'agent-1',          │
│      to_agent: 'agent-2',            │
│      content: 'Hello',               │
│      timestamp: 1234567890,          │
│      read: false,                    │
│      priority: 'normal'              │
│    )                                 │
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
│ MessageRouter (DuckDB)               │
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
CROWD_DB_PATH=./.crowd/db        # Default: ./.crowd/db
MESSAGE_EXPORT_INTERVAL=3600000  # Parquet export interval (ms), Default: 1 hour

# Keys
AGENT_KEYS_PATH=./.crowd/keys    # Default: ./.crowd/keys
```

## Security Considerations

### 1. Agent Authentication
- ✅ Asymmetric Key Pairs (RSA-2048)
- ✅ Private Keys nur in Agent Containers
- ✅ Public Keys im MCP Server
- ✅ Signatur-Verifizierung bei jedem Request

### 2. Container Isolation
- ✅ Private Keys als Read-Only Mounts
- ✅ Keys werden beim Container-Stop gelöscht
- ✅ Keine direkten Agent-zu-Agent Verbindungen

### 3. Message Security
- ⚠️ Messages sind nicht verschlüsselt (Future: E2E Encryption)
- ✅ Messages nur über MCP Server
- ✅ Agent kann nur eigene Messages lesen

## Parquet Export

**Purpose:**
- Analytische Auswertungen
- Long-term Storage
- Integration mit Data Analytics Tools

**Export Schedule:**
- Automatisch jede Stunde (konfigurierbar)
- Manuell via `MessageRouter.exportToParquet()`

**Schema:**
```parquet
message "messages" {
  required binary id (UTF8);
  required binary from_agent (UTF8);
  required binary to_agent (UTF8);
  required binary content (UTF8);
  required int64 timestamp;
  required boolean read;
  required binary priority (UTF8);
  optional int64 created_at (TIMESTAMP);
}
```

## Testing Strategy

### Unit Tests
- MessageRouter: CRUD operations, filtering, sorting
- KeyStore: Key registration, signature verification
- Agent MCP Tools: Alle Tools isoliert testen

### Integration Tests
- Agent spawn → Key generation → Container mount
- Message send → Store → Retrieve flow
- Signature verification end-to-end

### Manual Tests
- Zwei Agenten spawnen
- Nachricht von Agent-1 → Agent-2
- Broadcast von Agent-1 → alle
- Status-Update verifizieren

## Migration Path

**Phase 1: Core Implementation** (Current)
- ✅ Message types
- ⏳ MessageRouter with DuckDB
- ⏳ KeyStore implementation
- ⏳ Agent MCP Server

**Phase 2: Integration**
- ⏳ ContainerManager key generation
- ⏳ Agent container configuration
- ⏳ Wire all components in index.ts

**Phase 3: Testing & Refinement**
- ⏳ Unit tests
- ⏳ Integration tests
- ⏳ Performance optimization

**Phase 4: Advanced Features** (Future)
- Message encryption (E2E)
- Message TTL/cleanup
- Advanced analytics on Parquet data
- Key rotation
