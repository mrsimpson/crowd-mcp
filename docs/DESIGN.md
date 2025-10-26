# Design Document: crowd-mcp

## Technology Stack

- **Language**: TypeScript
- **Runtime**: Node.js 20+
- **Monorepo**: Based on template-typescript-monorepo
- **Container Runtime**: Docker
- **MCP SDK**: @modelcontextprotocol/sdk
- **Docker API**: dockerode

## Repository Structure

```
crowd-mcp/
├── packages/
│   ├── server/              # Main MCP server + CLI
│   │   ├── src/
│   │   │   ├── index.ts     # MCP server entry (stdio)
│   │   │   ├── cli.ts       # CLI entry (operator commands)
│   │   │   ├── core/        # Core components
│   │   │   ├── mcp/         # MCP tools
│   │   │   ├── api/         # WebSocket server
│   │   │   └── docker/      # Container management
│   │   └── package.json     # bin: { crowd-mcp, crowd-mcp-cli }
│   └── shared/              # Shared types & utilities
├── docker/
│   └── agent/
│       └── Dockerfile       # Agent container image
├── docs/
└── package.json             # Monorepo root
```

## Package: server

### Entry Points

```typescript
// packages/server/src/index.ts - MCP Server (stdio)
// Started by Claude Desktop via npx

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

async function main() {
  // Initialize MCP server with Management Interface
  const server = new Server(
    {
      name: "crowd-mcp",
      version: "0.1.0",
    },
    {
      capabilities: { tools: {} },
    },
  );

  // Register management tools
  registerManagementTools(server);

  // Also start HTTP API for CLI + WebSocket for operators
  await startOperatorAPI();

  // Connect stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main();
```

```typescript
// packages/server/src/cli.ts - Operator CLI
// Run directly by operators via npx crowd-mcp-cli

import { Command } from "commander";

const program = new Command();

program
  .name("crowd-mcp-cli")
  .description("Operator CLI for crowd-mcp")
  .version("0.1.0");

program.command("list").description("List all agents").action(listCommand);

program
  .command("attach <agentId>")
  .description("Attach to agent session")
  .action(attachCommand);

program.parse();
```

### Core Interfaces

```typescript
// packages/shared/src/types.ts

interface Agent {
  id: string;
  status: "initializing" | "idle" | "working" | "blocked" | "stopped";
  task?: string;
  capabilities: string[];
  startTime: number;
  containerId: string;
}

interface Message {
  id: string;
  from: string;
  to: string;
  content: string;
  timestamp: number;
  read: boolean;
  priority: "low" | "normal" | "high";
}

interface AttachSession {
  id: string;
  agentId: string;
  clients: AttachClient[];
  createdAt: Date;
}

interface AttachClient {
  id: string;
  type: "cli" | "websocket";
  send(data: Buffer): void;
  resize(rows: number, cols: number): void;
  close(): void;
}
```

### Component: AgentRegistry

```typescript
// packages/server/src/core/agent-registry.ts

interface IAgentRegistry {
  register(agent: Agent): void;
  unregister(agentId: string): void;
  get(agentId: string): Agent | undefined;
  list(filter?: AgentFilter): Agent[];
  update(agentId: string, update: Partial<Agent>): void;
}

interface AgentFilter {
  status?: Agent["status"];
  capability?: string;
}
```

### Component: MessageRouter

```typescript
// packages/server/src/core/message-router.ts

interface IMessageRouter {
  send(message: Omit<Message, "id" | "read">): Promise<Message>;
  broadcast(from: string, content: string): Promise<string[]>;
  getMessages(agentId: string, opts: GetMessagesOptions): Message[];
  markRead(messageId: string): void;
}

interface GetMessagesOptions {
  unreadOnly?: boolean;
  limit?: number;
  since?: number;
}
```

### Component: AttachManager

```typescript
// packages/server/src/core/attach-manager.ts

interface IAttachManager {
  attach(agentId: string, client: AttachClient): Promise<AttachSession>;
  detach(agentId: string, clientId: string): void;
  sendInput(agentId: string, data: Buffer): void;
  resize(agentId: string, rows: number, cols: number): Promise<void>;
  getSessions(): AttachSession[];
}
```

### Component: ContainerManager

```typescript
// packages/server/src/docker/container-manager.ts

interface IContainerManager {
  create(config: ContainerConfig): Promise<Container>;
  start(containerId: string): Promise<void>;
  stop(containerId: string): Promise<void>;
  remove(containerId: string): Promise<void>;
  exec(containerId: string, cmd: string[]): Promise<ExecResult>;
  attach(containerId: string): Promise<Stream>;
}

interface ContainerConfig {
  agentId: string;
  image: string;
  workspace: string; // Host path
  env: Record<string, string>;
  resources: ResourceLimits;
}

interface ResourceLimits {
  memory: number; // bytes
  cpuQuota: number; // microseconds per 100ms
  pidsLimit: number;
}

interface Container {
  id: string;
  agentId: string;
}
```

## MCP Interfaces

### Management Interface (for AI clients)

```typescript
// packages/server/src/mcp/management-tools.ts

const MANAGEMENT_TOOLS = [
  {
    name: "spawn_agent",
    description: "Spawn a new autonomous agent",
    inputSchema: {
      type: "object",
      properties: {
        task: { type: "string" },
        capabilities: {
          type: "array",
          items: { type: "string" },
        },
      },
      required: ["task"],
    },
  },
  {
    name: "list_agents",
    description: "List all active agents",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string" },
      },
    },
  },
  {
    name: "get_agent_status",
    description: "Get detailed status of an agent",
    inputSchema: {
      type: "object",
      properties: {
        agentId: { type: "string" },
      },
      required: ["agentId"],
    },
  },
  {
    name: "stop_agent",
    description: "Stop a running agent",
    inputSchema: {
      type: "object",
      properties: {
        agentId: { type: "string" },
      },
      required: ["agentId"],
    },
  },
];
```

### Agent Collaboration Interface (for agents)

```typescript
// packages/server/src/mcp/agent-tools.ts

const AGENT_TOOLS = [
  {
    name: "discover_agents",
    description: "Discover other active agents",
    inputSchema: {
      type: "object",
      properties: {
        capability: { type: "string" },
        status: { type: "string" },
      },
    },
  },
  {
    name: "send_to_agent",
    description: "Send message to another agent",
    inputSchema: {
      type: "object",
      properties: {
        targetAgentId: { type: "string" },
        message: { type: "string" },
        priority: {
          type: "string",
          enum: ["low", "normal", "high"],
        },
      },
      required: ["targetAgentId", "message"],
    },
  },
  {
    name: "broadcast_message",
    description: "Broadcast message to all agents",
    inputSchema: {
      type: "object",
      properties: {
        message: { type: "string" },
      },
      required: ["message"],
    },
  },
  {
    name: "get_my_messages",
    description: "Retrieve messages for this agent",
    inputSchema: {
      type: "object",
      properties: {
        unreadOnly: { type: "boolean", default: true },
        limit: { type: "number", default: 10 },
      },
    },
  },
  {
    name: "update_my_status",
    description: "Update this agent's status",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["idle", "working", "blocked"],
        },
        task: { type: "string" },
        capabilities: {
          type: "array",
          items: { type: "string" },
        },
      },
    },
  },
];
```

## Operator Interfaces

### CLI Commands

```typescript
// packages/cli/src/commands.ts

interface CLICommand {
  name: string;
  description: string;
  handler: (args: any) => Promise<void>;
}

const COMMANDS: CLICommand[] = [
  {
    name: "list",
    description: "List all agents",
    handler: listCommand,
  },
  {
    name: "attach <agentId>",
    description: "Attach to agent session",
    handler: attachCommand,
  },
  {
    name: "logs <agentId>",
    description: "View agent logs",
    handler: logsCommand,
  },
  {
    name: "stop <agentId>",
    description: "Stop agent",
    handler: stopCommand,
  },
];
```

### WebSocket Protocol

```typescript
// packages/server/src/api/websocket.ts

type WSMessage =
  | { type: "attach"; agentId: string }
  | { type: "input"; data: string } // base64
  | { type: "resize"; rows: number; cols: number }
  | { type: "detach" };

type WSResponse =
  | { type: "attached"; agentId: string }
  | { type: "output"; data: string } // base64
  | { type: "detached" }
  | { type: "error"; message: string };
```

## Docker Setup

### Agent Container Image

```dockerfile
# docker/agent/Dockerfile

FROM node:20-alpine

# Install OpenCode
RUN npm install -g opencode-ai@latest

# MCP Configuration
COPY mcp-config.json /root/.config/opencode/mcp.json

WORKDIR /workspace

ENTRYPOINT ["opencode"]
```

### MCP Configuration in Agent

```json
{
  "mcpServers": {
    "crowd-mcp": {
      "transport": "sse",
      "url": "http://host.docker.internal:3100/mcp/agent"
    }
  }
}
```

### Docker Network

```
Network: crowd-mcp-network
Driver: bridge
Subnet: 172.28.0.0/16

Containers:
- crowd-mcp-server (host)
- agent-{id} (multiple)
```

## Configuration

### Server Configuration

```typescript
// packages/server/src/config.ts

interface ServerConfig {
  docker: {
    network: string;
    agentImage: string;
    defaultResources: ResourceLimits;
  };

  agent: {
    maxConcurrent: number;
    autoCleanup: boolean;
    idleTimeout: number; // ms
  };

  mcp: {
    management: {
      transport: "stdio"; // For Claude Desktop
    };
    agent: {
      transport: "sse"; // For agents in containers
      port: number; // Default: 3100
    };
  };

  operator: {
    http: {
      enabled: boolean; // Default: true
      port: number; // Default: 3000 (for CLI)
    };
    websocket: {
      enabled: boolean; // Default: true
      port: number; // Default: 8080
    };
  };
}
```

### Process Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Host System                       │
│                                                      │
│  ┌──────────────────┐        ┌──────────────────┐  │
│  │ Claude Desktop   │        │  Operator        │  │
│  │                  │        │  (Terminal)      │  │
│  └────────┬─────────┘        └────────┬─────────┘  │
│           │ npx crowd-mcp             │ npx         │
│           │                           │ crowd-mcp-cli
│           │                           │             │
│      ┌────▼───────────────────────────▼────┐       │
│      │     MCP Server Process              │       │
│      │  ┌──────────┐    ┌──────────────┐   │       │
│      │  │  stdio   │    │  HTTP :3000  │   │       │
│      │  │ (MCP Mgt)│    │  (CLI API)   │   │       │
│      │  └──────────┘    └──────────────┘   │       │
│      │  ┌──────────┐    ┌──────────────┐   │       │
│      │  │ SSE:3100 │    │  WS :8080    │   │       │
│      │  │(Agent MCP)    │ (Attach API) │   │       │
│      │  └──────────┘    └──────────────┘   │       │
│      └───────────────┬──────────────────────┘       │
│                      │                              │
│         ┌────────────┼────────────┐                 │
│         │ Docker     │            │                 │
│         │  ┌─────────▼───────┐ ┌─▼──────────┐      │
│         │  │ Agent Container │ │  Agent     │      │
│         │  │   (OpenCode)    │ │ Container  │      │
│         │  │   MCP Client    │ │            │      │
│         │  │   → :3100       │ │            │      │
│         │  └─────────────────┘ └────────────┘      │
│         └─────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

## Data Persistence

### In-Memory State (v1)

```typescript
// All state stored in memory
class State {
  agents: Map<string, Agent>;
  messages: Map<string, Message[]>; // agentId -> messages
  sessions: Map<string, AttachSession>;
}

// Implications:
// - Server restart = all state lost
// - Agents continue running but orphaned
// - Messages lost
```

### Future: Persistent State (v2)

```
Options:
- SQLite for metadata (agents, messages)
- File-based message queue
- Redis for distributed setup
```

## Error Handling

### Agent Spawn Failures

```
Causes:
- Docker daemon unavailable
- Image not found
- Resource limits exceeded

Response:
- Return error to caller
- Do not create partial state
- Log failure
```

### Message Delivery Failures

```
Causes:
- Target agent stopped
- Target agent not found

Response:
- Queue message anyway (agent may restart)
- Return warning to sender
- TTL-based cleanup
```

### Attach Failures

```
Causes:
- Agent not running
- Container unreachable

Response:
- Return error immediately
- Do not create session
- Suggest checking agent status
```

## Testing Strategy

### Unit Tests

- Component interfaces in isolation
- Mock dependencies (Docker, MCP)

### Integration Tests

- Real Docker containers
- Real MCP server
- Test full flows end-to-end

### Manual Tests

- CLI attach experience
- WebSocket attach via test client
- Multi-agent message passing

## Distribution & Deployment

### Distribution Strategy

**v1: npx (Development)**

- No installation required
- Direct execution via npm
- Easy updates
- Node.js required on host

**v2+: Standalone Binary (Future)**

- No Node.js required
- Packaged with pkg/nexe
- Platform-specific builds

### Prerequisites

```
- Docker daemon running
- Node.js 20+ (for v1)
- Network access for Docker image pull
```

### Package Configuration

```json
// packages/server/package.json
{
  "name": "crowd-mcp",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "crowd-mcp": "./dist/index.js",
    "crowd-mcp-cli": "./dist/cli.js"
  },
  "files": ["dist"],
  "publishConfig": {
    "access": "public"
  }
}
```

### MCP Client Configuration (Claude Desktop)

```json
// ~/Library/Application Support/Claude/claude_desktop_config.json (macOS)
// %APPDATA%/Claude/claude_desktop_config.json (Windows)
// ~/.config/Claude/claude_desktop_config.json (Linux)

{
  "mcpServers": {
    "crowd-mcp": {
      "command": "npx",
      "args": ["-y", "crowd-mcp@latest"],
      "env": {
        "DOCKER_HOST": "unix:///var/run/docker.sock"
      }
    }
  }
}
```

**Explanation:**

- `npx -y crowd-mcp@latest`: Auto-confirms install, always uses latest
- Claude Desktop starts process when it launches
- Process communicates via stdio
- Process stops when Claude Desktop closes

### Operator CLI Usage

**CLI Communication:**
The CLI communicates with the running MCP server via HTTP API (not via MCP protocol).

```
Claude Desktop → stdio → MCP Server (Management Interface)
CLI Tool → HTTP → MCP Server (Operator API)
```

```bash
# List agents (requires MCP server running)
npx crowd-mcp-cli list

# Attach to agent
npx crowd-mcp-cli attach agent-123

# View logs
npx crowd-mcp-cli logs agent-123

# Stop agent
npx crowd-mcp-cli stop agent-123
```

**CLI Configuration:**

```typescript
// CLI discovers server via:
// 1. Environment variable: CROWD_MCP_URL
// 2. State file: ~/.crowd-mcp/server.json (written by MCP server on start)
// 3. Default: http://localhost:3000

interface ServerState {
  pid: number;
  port: number;
  started: string;
}
```

### Development Setup

```bash
# Clone repo
git clone https://github.com/mrsimpson/crowd-mcp
cd crowd-mcp

# Install dependencies
npm install

# Build
npm run build

# Run MCP server locally
node packages/server/dist/index.js

# Run CLI locally
node packages/server/dist/cli.js list
```

### Publishing to npm

```bash
# From monorepo root
cd packages/server
npm publish
```

## Monitoring & Observability

### Metrics to Track

- Agent count (total, by status)
- Message queue depth per agent
- Attach session count
- Container resource usage

### Logging

- Structured JSON logs
- Log levels: debug, info, warn, error
- Per-component logging

### Health Checks

```typescript
interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  docker: "connected" | "disconnected";
  agentCount: number;
  messageQueueSize: number;
}
```

## Security Considerations

### Container Security

- Drop all capabilities except required
- Read-only root filesystem where possible
- No privileged mode
- Resource limits enforced

### API Security

- WebSocket authentication via API key
- CLI uses local socket (Unix domain socket)
- No public exposure of agent containers

### Workspace Isolation

- Only mounted workspace is shared
- No access to host system beyond workspace
- File permissions enforced by host OS

## Minimal v1 Scope

### Included

- Agent spawn/stop/list
- Inter-agent messaging (point-to-point, broadcast)
- CLI attach
- WebSocket attach
- Shared workspace

### Excluded (Future)

- Persistence
- Authentication/Authorization
- Web UI
- Distributed deployment
- Agent migration
- Advanced scheduling
