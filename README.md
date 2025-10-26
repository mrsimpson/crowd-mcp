# crowd-mcp

> **Spawn and orchestrate autonomous AI agents via MCP**

An MCP (Model Context Protocol) server that enables AI coding assistants to spawn, manage, and coordinate multiple autonomous AI agents running in isolated Docker containers. Agents can collaborate on complex tasks, communicate with each other, and be manually supervised when needed.

## Features

- 🚀 **Agent Spawning** - Spawn autonomous agents via MCP tools
- 🎨 **Real-time Web Dashboard** - Monitor agents with live updates (no polling!)
- 🤝 **Agent Collaboration** - Agents discover and communicate with each other
- 👁️ **Manual Oversight** - Attach to agent sessions via CLI
- 📂 **Shared Workspace** - All agents work on the same codebase
- 🔒 **Isolated Execution** - Each agent runs in its own Docker container
- 🎯 **Zero Installation** - Runs via `npx`, no global installation needed

## Use Case

Enable your AI assistant to delegate complex software tasks to specialized agents:

```
AI Assistant: "Build a full-stack user authentication system"
  ↓
  Spawns 3 agents:
  - Agent-1 (Frontend): Build React login/signup UI
  - Agent-2 (Backend): Implement JWT auth API
  - Agent-3 (Database): Design user schema & migrations

  Agents collaborate:
  - Agent-1 asks Agent-2: "What's the login endpoint?"
  - Agent-2 responds: "POST /api/auth/login"
  - Agent-3 notifies: "User table ready"

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

🚧 **In Active Development** - Web dashboard complete with controls, core MCP features in progress

**Implemented:**
- ✅ spawn_agent MCP tool (FR1.1)
- ✅ Real-time web dashboard with SSE (FR6)
  - ✅ Real-time agent list and updates
  - ✅ Stop agents from UI (FR6.3)
  - ✅ View agent logs from UI (FR6.4)
- ✅ Event-driven AgentRegistry
- ✅ Docker container management
- ✅ HTTP API (read & control endpoints)

**In Progress / Planned:**
- ⏳ list_agents MCP tool (FR1.2)
- ⏳ stop_agent MCP tool (FR1.3)
- ⏳ Agent-to-agent communication (FR2.x)
- ⏳ CLI attach functionality (FR3.2)
- ⏳ Resource limits (FR5.x)

**Test Coverage:** 25 tests passing (web-server + MCP server)

## Quick Start

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
        "HTTP_PORT": "3000"
      }
    }
  }
}
```

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

### 3. Use the spawn_agent Tool

```
You: "Spawn an agent to refactor the authentication module"

AI Assistant: [Uses spawn_agent tool]
              Agent spawned successfully!

              ID: agent-1730000000000
              Task: Refactor the authentication module
              Container: abc123def456

              View and control agents at:
              http://localhost:3000
```

The dashboard URL is included in every spawn_agent response, so you always know where to find your agents!

**Note:** Additional MCP tools (list_agents, stop_agent) are planned but not yet implemented. You can monitor and control agents using the web dashboard in the meantime.

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
- ✅ Basic agent spawning (spawn_agent tool)
- ✅ Real-time web dashboard with SSE
- ✅ Event-driven architecture
- ⏳ Additional MCP tools (list_agents, stop_agent)
- ⏳ CLI attach functionality
- ⏳ Agent-to-agent messaging

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
