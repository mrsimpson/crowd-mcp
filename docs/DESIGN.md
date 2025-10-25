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
│   ├── server/              # Main MCP server
│   ├── cli/                 # Operator CLI tool
│   └── shared/              # Shared types & utilities
├── docker/
│   └── agent/
│       └── Dockerfile       # Agent container image
├── docs/
└── package.json
```

## Package: server

### Core Interfaces

```typescript
// packages/shared/src/types.ts

interface Agent {
  id: string;
  status: 'initializing' | 'idle' | 'working' | 'blocked' | 'stopped';
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
  priority: 'low' | 'normal' | 'high';
}

interface AttachSession {
  id: string;
  agentId: string;
  clients: AttachClient[];
  createdAt: Date;
}

interface AttachClient {
  id: string;
  type: 'cli' | 'websocket';
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
  status?: Agent['status'];
  capability?: string;
}
```

### Component: MessageRouter

```typescript
// packages/server/src/core/message-router.ts

interface IMessageRouter {
  send(message: Omit<Message, 'id' | 'read'>): Promise<Message>;
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
  workspace: string;  // Host path
  env: Record<string, string>;
  resources: ResourceLimits;
}

interface ResourceLimits {
  memory: number;      // bytes
  cpuQuota: number;    // microseconds per 100ms
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
    name: 'spawn_agent',
    description: 'Spawn a new autonomous agent',
    inputSchema: {
      type: 'object',
      properties: {
        task: { type: 'string' },
        capabilities: {
          type: 'array',
          items: { type: 'string' }
        }
      },
      required: ['task']
    }
  },
  {
    name: 'list_agents',
    description: 'List all active agents',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string' }
      }
    }
  },
  {
    name: 'get_agent_status',
    description: 'Get detailed status of an agent',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string' }
      },
      required: ['agentId']
    }
  },
  {
    name: 'stop_agent',
    description: 'Stop a running agent',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string' }
      },
      required: ['agentId']
    }
  }
];
```

### Agent Collaboration Interface (for agents)

```typescript
// packages/server/src/mcp/agent-tools.ts

const AGENT_TOOLS = [
  {
    name: 'discover_agents',
    description: 'Discover other active agents',
    inputSchema: {
      type: 'object',
      properties: {
        capability: { type: 'string' },
        status: { type: 'string' }
      }
    }
  },
  {
    name: 'send_to_agent',
    description: 'Send message to another agent',
    inputSchema: {
      type: 'object',
      properties: {
        targetAgentId: { type: 'string' },
        message: { type: 'string' },
        priority: {
          type: 'string',
          enum: ['low', 'normal', 'high']
        }
      },
      required: ['targetAgentId', 'message']
    }
  },
  {
    name: 'broadcast_message',
    description: 'Broadcast message to all agents',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string' }
      },
      required: ['message']
    }
  },
  {
    name: 'get_my_messages',
    description: 'Retrieve messages for this agent',
    inputSchema: {
      type: 'object',
      properties: {
        unreadOnly: { type: 'boolean', default: true },
        limit: { type: 'number', default: 10 }
      }
    }
  },
  {
    name: 'update_my_status',
    description: 'Update this agent\'s status',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['idle', 'working', 'blocked']
        },
        task: { type: 'string' },
        capabilities: {
          type: 'array',
          items: { type: 'string' }
        }
      }
    }
  }
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
    name: 'list',
    description: 'List all agents',
    handler: listCommand
  },
  {
    name: 'attach <agentId>',
    description: 'Attach to agent session',
    handler: attachCommand
  },
  {
    name: 'logs <agentId>',
    description: 'View agent logs',
    handler: logsCommand
  },
  {
    name: 'stop <agentId>',
    description: 'Stop agent',
    handler: stopCommand
  }
];
```

### WebSocket Protocol

```typescript
// packages/server/src/api/websocket.ts

type WSMessage =
  | { type: 'attach', agentId: string }
  | { type: 'input', data: string }  // base64
  | { type: 'resize', rows: number, cols: number }
  | { type: 'detach' };

type WSResponse =
  | { type: 'attached', agentId: string }
  | { type: 'output', data: string }  // base64
  | { type: 'detached' }
  | { type: 'error', message: string };
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
    idleTimeout: number;  // ms
  };

  mcp: {
    management: {
      transport: 'stdio';
    };
    agent: {
      transport: 'sse';
      port: number;
    };
  };

  operator: {
    websocket: {
      enabled: boolean;
      port: number;
    };
    http: {
      enabled: boolean;
      port: number;
    };
  };
}
```

## Data Persistence

### In-Memory State (v1)

```typescript
// All state stored in memory
class State {
  agents: Map<string, Agent>;
  messages: Map<string, Message[]>;  // agentId -> messages
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

## Deployment

### Prerequisites
```
- Docker daemon running
- Node.js 20+
- Network access for agent image pull
```

### Installation
```bash
npm install -g crowd-mcp
```

### Configuration
```bash
crowd-mcp init  # Creates config file
```

### Running
```bash
# Start MCP server (for Claude)
crowd-mcp serve

# Separate terminal: Use CLI
crowd-mcp list
crowd-mcp attach agent-123
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
  status: 'healthy' | 'degraded' | 'unhealthy';
  docker: 'connected' | 'disconnected';
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
