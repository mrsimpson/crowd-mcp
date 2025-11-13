# crowd-mcp

> **Spawn and orchestrate autonomous AI agents via MCP**

An MCP (Model Context Protocol) server that enables AI coding assistants to spawn, manage, and coordinate multiple autonomous AI agents running in isolated Docker containers. Agents can collaborate on complex tasks, communicate with each other, and be manually supervised when needed.

## Features

- 🚀 **Agent Spawning** - Spawn autonomous agents via MCP tools
- 🎭 **Agent Templates** - Pre-configured agent types with specialized behavior
  - Custom system prompts per agent type
  - Model preferences and LLM settings
  - MCP server configurations (stdio + HTTP/SSE)
  - Example agents: architect, coder, reviewer
- 💬 **Agent Messaging** - Full messaging system with persistence (JSONL-based)
  - Direct agent-to-agent messaging
  - Broadcast messaging to all agents
  - Message history and retrieval
  - Priority-based message queuing
- 🎨 **Real-time Web Dashboard** - Monitor agents with live updates (no polling!)
- 🤝 **Agent Collaboration** - Agents discover and communicate with each other
- 📂 **Shared Workspace** - All agents work on the same codebase
- 🔒 **Isolated Execution** - Each agent runs in its own Docker container
- 🎯 **Zero Installation** - Runs via `npx`, no global installation needed
- 🔌 **Dual MCP Interfaces** - Management (stdio) + Agent (SSE) interfaces

## Use Case

Enable your AI assistant to delegate complex software tasks to specialized agents:

```
AI Assistant: "Build a full-stack user authentication system"
  ↓
  Spawns 3 specialized agents:
  - Architect Agent: Design the authentication architecture
  - Coder Agent (Frontend): Build React login/signup UI
  - Coder Agent (Backend): Implement JWT auth API

  Agents collaborate:
  - Architect defines: "Use JWT with refresh tokens, httpOnly cookies"
  - Frontend Coder asks Backend: "What's the login endpoint?"
  - Backend Coder responds: "POST /api/auth/login"
  - Architect reviews: "Add rate limiting to prevent brute force"

  Operator can attach to any agent for debugging
```

## Prerequisites

- **Docker** - Agent containers run in Docker
- **Node.js 20+** - For development (not needed if using npx)
- **MCP-Compatible Client** - Such as Claude Desktop, GitHub Copilot, Amazon Q, or OpenCode

## Documentation

- 📋 [Product Requirements (PRD)](docs/PRD.md) - Functional requirements and user personas
- 🏗️ [Architecture](docs/ARCHITECTURE.md) - Technology-agnostic system design
- 🔧 [Design](docs/DESIGN.md) - TypeScript/Docker implementation details

## Status

✅ **Core Features Complete** - Agent lifecycle, messaging, and web dashboard fully operational

**Implemented:**

- ✅ **Agent Lifecycle** (FR1)
  - spawn_agent, list_agents, stop_agent MCP tools
  - Optional agentType parameter for specialized agents
- ✅ **Agent Communication** (FR2)
  - Agent-to-agent messaging
  - Broadcast messaging
  - Message discovery and retrieval
  - JSONL-based persistent message storage
  - Agent MCP Server (SSE on port 3100)
- ✅ **Agent Configuration** (FR7)
  - YAML-based agent templates (.crowd/agents/)
  - Custom system prompts per agent type
  - Model preferences and LLM settings
  - MCP server configuration (stdio + HTTP/SSE)
  - Environment variable templating
  - Automatic messaging server injection
  - Example agents: architect, coder, reviewer
- ✅ **Real-time Web Dashboard** (FR6)
  - Real-time agent list with SSE updates
  - Stop agents from UI
  - View agent logs from UI
- ✅ **Docker Integration**
  - Container management
  - Shared workspace mounting
  - Agent environment configuration
  - Runtime config generation via AGENT_CONFIG env var

**Documentation:**

- 📋 [PRD](docs/PRD.md) - Requirements and implementation status
- 🏗️ [Architecture](docs/ARCHITECTURE.md) - System overview
- 💬 [Messaging Architecture](docs/MESSAGING_ARCHITECTURE.md) - Detailed messaging system design

**In Progress / Planned:**

- ⏳ CLI attach functionality (FR3.2)
- ⏳ Resource limits (FR5.x)
- ⏳ Cryptographic agent authentication
- ⏳ Message TTL and automatic cleanup
- ⏳ Automatic cleanup of completed agents (FR1.4)

**Test Coverage:** 158 tests passing (includes MessageRouter, MessagingTools, AgentConfig, ContainerManager, McpServer + Integration tests)

## Quick Start

### 0. Configure OpenCode (Required)

Before using crowd-mcp, you **must configure at least one LLM provider** for OpenCode:

1. **Create configuration directory:**

   ```bash
   mkdir -p .crowd/opencode
   ```

2. **Copy example configurations:**

   ```bash
   cp .crowd/opencode/opencode.json.example .crowd/opencode/opencode.json
   cp .crowd/opencode/.env.example .crowd/opencode/.env.local
   ```

3. **Edit `.crowd/opencode/opencode.json`** - Configure your LLM providers
4. **Edit `.crowd/opencode/.env.local`** - Add your API keys

**Minimal configuration:**

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "anthropic": {
      "npm": "@anthropic-ai/sdk",
      "options": { "apiKey": "{env:ANTHROPIC_API_KEY}" },
      "models": {
        "claude-3-5-sonnet-20241022": { "name": "Claude 3.5 Sonnet" }
      }
    }
  }
}
```

**See [OpenCode Configuration Guide](docs/opencode-configuration.md) for complete documentation.**

> **Testing without LLM providers?** Set `CROWD_DEMO_MODE=true` to bypass validation. See [Demo Mode](docs/opencode-configuration.md#demo-mode) for details.

#### Agent Templates (Optional)

crowd-mcp includes three example agent templates:

- **architect** - Software architecture and system design
- **coder** - Implementation and coding tasks
- **reviewer** - Code review and quality assurance

These are located in `.crowd/agents/*.yaml` and can be customized or extended. When spawning agents, you can specify an `agentType` to use these templates, or omit it to use the default OpenCode configuration.

### 1. Setup Your MCP Client

**Example: Claude Desktop**

Add to your Claude Desktop configuration file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%/Claude/claude_desktop_config.json`
**Linux**: `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "crowd-mcp": {
      "command": "npx",
      "args": ["-y", "crowd-mcp@latest"],
      "env": {
        "HTTP_PORT": "3000",
        "AGENT_MCP_PORT": "3100"
      }
    }
  }
}
```

**Environment Variables:**

- `HTTP_PORT` - Web dashboard port (default: 3000)
- `AGENT_MCP_PORT` - Agent communication port (default: 3100)
- `MESSAGE_BASE_DIR` - Message storage directory (default: ./.crowd/sessions)
- `SESSION_ID` - Custom session ID (default: auto-generated timestamp)
- `CROWD_LOG_LEVEL` - Log level: DEBUG, INFO, WARN, ERROR (default: WARN)
- `OPERATOR_NAME` - Display name for the human operator in messaging (default: "Human Operator")

See [Logging Configuration](docs/logging.md) for detailed logging setup.

Restart your MCP client. The server will start automatically when your client launches.

> **Note:** Configuration steps vary by client. Refer to your MCP client's documentation for specific setup instructions. The configuration format above is for Claude Desktop, but the same `npx crowd-mcp@latest` command works with any MCP-compatible client.

### 2. Open Web Dashboard

Navigate to http://localhost:3000 to see the real-time agent dashboard. The UI updates automatically via Server-Sent Events when agents are created, updated, or removed.

**Dashboard Features:**

- 📊 Real-time agent list with live updates
- 🔍 Agent details (ID, task, container ID, status)
- 🛑 Stop agents with confirmation dialog
- 📜 View agent logs in modal viewer
- 🟢 Connection status indicator
- 🎨 Dark theme UI

**Configuring the Port:**

The web server listens on **port 3000** by default. If this port is already in use, you can change it by setting the `HTTP_PORT` environment variable in your MCP client configuration:

```json
{
  "mcpServers": {
    "crowd-mcp": {
      "command": "npx",
      "args": ["-y", "crowd-mcp@latest"],
      "env": {
        "HTTP_PORT": "3001"
      }
    }
  }
}
```

The server will display clear error messages if the port is unavailable and guide you to change it.

### 3. Use the MCP Tools

**Available Tools:**

**Agent Lifecycle:**

1. **spawn_agent** - Create a new autonomous agent
   - `task` (required): The task description
   - `agentType` (optional): Agent template to use (architect, coder, reviewer, or custom)
2. **list_agents** - View all running agents
3. **stop_agent** - Terminate a specific agent

**Messaging & Communication:**

4. **send_message** - Send message to agent or broadcast to all
5. **get_messages** - Retrieve messages for developer
6. **mark_messages_read** - Mark messages as read
7. **discover_agents** - List active agents with filters

**Example Usage:**

**Basic agent spawn:**

```
You: "Spawn an agent to refactor the authentication module"

AI Assistant: [Uses spawn_agent tool with task only]
              Agent spawned successfully!

              ID: agent-1730000000000
              Task: Refactor the authentication module
              Container: abc123def456

              View and control agents at:
              http://localhost:3000
```

**Spawn specialized agent:**

```
You: "Spawn an architect agent to design the API structure"

AI Assistant: [Uses spawn_agent tool with task and agentType="architect"]
              Agent spawned successfully!

              ID: agent-1730000000001
              Task: Design the API structure
              Type: architect
              Container: def456ghi789

              View and control agents at:
              http://localhost:3000
```

```
You: "List all running agents"

AI Assistant: [Uses list_agents tool]
              Active Agents (2):

              1. agent-1730000000000
                 Task: Refactor the authentication module
                 Container: abc123def456

              2. agent-1730000000123
                 Task: Fix bug in payment processing
                 Container: def789ghi012
```

```
You: "Stop agent agent-1730000000000"

AI Assistant: [Uses stop_agent tool]
              Agent agent-1730000000000 stopped successfully.
```

AI assistants can now fully manage agent lifecycle programmatically! You can also use the web dashboard at http://localhost:3000 for visual monitoring and control.

### 4. Development Mode

For local development and testing:

```bash
# Clone and install
git clone https://github.com/mrsimpson/crowd-mcp
cd crowd-mcp
pnpm install

# Build
pnpm build

# Run server
pnpm --filter crowd-mcp start
```

## How It Works

```
┌─────────────────────────────────────────────────────┐
│          MCP Client (Claude, Copilot, etc.)          │
└────────────────────┬────────────────────────────────┘
                     │ stdio (MCP Protocol)
                     │
┌────────────────────▼────────────────────────────────┐
│              crowd-mcp MCP Server                    │
│  ┌────────────────────────────────────────────────┐ │
│  │ MCP Tools                                      │ │
│  │  - spawn_agent                                 │ │
│  └────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────┐ │
│  │ HTTP/SSE Server (Web Dashboard)                │ │
│  │  - GET /api/agents      - List agents          │ │
│  │  - GET /api/agents/:id  - Get agent details    │ │
│  │  - GET /api/events      - Real-time SSE stream │ │
│  │  - GET /               - Web UI                │ │
│  └────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────┐ │
│  │ AgentRegistry (Event-Driven)                   │ │
│  │  - Syncs from Docker on startup                │ │
│  │  - Emits events: agent:created/updated/removed │ │
│  └────────────────────────────────────────────────┘ │
└────────────────────┬────────────────────────────────┘
                     │ Docker API
         ┌───────────┼───────────┐
         │           │           │
    ┌────▼────┐ ┌────▼────┐ ┌───▼─────┐
    │ Agent-1 │ │ Agent-2 │ │ Agent-3 │
    │(OpenCode│ │(OpenCode│ │(OpenCode│
    │ in      │ │ in      │ │ in      │
    │ Docker) │ │ Docker) │ │ Docker) │
    └────┬────┘ └────┬────┘ └────┬────┘
         │           │           │
         └───────────┴───────────┘
                     │
              ┌──────▼──────┐
              │  Workspace  │
              │  (Shared)   │
              └─────────────┘
                     ▲
                     │
         ┌───────────┴───────────┐
         │                       │
    ┌────┴──────┐         ┌──────┴─────┐
    │  Browser  │         │ CLI Attach │
    │ Dashboard │         │  (Future)  │
    └───────────┘         └────────────┘
       (SSE)                  (TTY)
```

**Key Components:**

1. **MCP Server** - Runs as child process of your MCP client, provides MCP tools
2. **HTTP/SSE Server** - Serves web dashboard and real-time event stream (port 3000)
3. **AgentRegistry** - Event-driven in-memory registry synced from Docker
4. **Agent Containers** - Isolated Docker containers running OpenCode (AI coding agent)
5. **Web Dashboard** - Real-time monitoring UI using Server-Sent Events
6. **Shared Workspace** - Mounted volume accessible to all agents

## Development

### Local Setup

```bash
# Clone repository
git clone https://github.com/mrsimpson/crowd-mcp
cd crowd-mcp

# Install dependencies
npm install

# Build TypeScript
npm run build

# Run MCP server directly (for testing)
node packages/server/dist/index.js
```

### Running Tests

```bash
# Unit tests
npm test

# Integration tests (requires Docker)
npm run test:integration
```

### Project Structure

```
crowd-mcp/
├── packages/
│   ├── server/       # MCP server implementation
│   ├── web-server/   # HTTP API + real-time web dashboard
│   └── shared/       # Shared types (Agent interface)
├── docker/
│   └── agent/        # Agent container Dockerfile
└── docs/             # Documentation (PRD, Architecture, Design)
```

## Contributing

Contributions welcome! Please read the documentation first:

1. Check [open issues](https://github.com/mrsimpson/crowd-mcp/issues)
2. Review the [Architecture](docs/ARCHITECTURE.md) and [Design](docs/DESIGN.md) docs
3. Submit a PR with tests

## Related Projects

- [Model Context Protocol](https://modelcontextprotocol.io/) - Protocol specification
- [OpenCode](https://github.com/sst/opencode) - AI coding agent used in containers

**MCP Clients:**

- [Claude Desktop](https://claude.ai/download) - Desktop app with MCP support
- [GitHub Copilot](https://github.com/features/copilot) - AI pair programmer
- [Amazon Q](https://aws.amazon.com/q/) - AWS AI assistant
- [OpenCode](https://github.com/sst/opencode) - Autonomous coding agent

## Roadmap

**v0.1** (Current - In Progress)

- ✅ Agent lifecycle management (spawn_agent, list_agents, stop_agent)
- ✅ Agent configuration system with templates
- ✅ Agent-to-agent messaging
- ✅ Real-time web dashboard with interactive controls
- ✅ Event-driven architecture
- ⏳ CLI attach functionality
- ⏳ Automatic cleanup of completed agents

**v0.2** (Planned)

- Persistent message queue
- Agent state recovery
- Resource usage tracking & limits

**v0.3** (Planned)

- Standalone binary distribution
- Advanced agent scheduling
- WebSocket support for web attach

## License

MIT

## Authors

Created by [Oliver Simpson](https://github.com/mrsimpson)
