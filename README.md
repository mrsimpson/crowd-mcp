# crowd-mcp

> **Spawn and orchestrate autonomous AI agents via MCP**

An MCP (Model Context Protocol) server that enables Claude to spawn, manage, and coordinate multiple autonomous AI agents running in isolated Docker containers. Agents can collaborate on complex tasks, communicate with each other, and be manually supervised when needed.

## Features

- 🚀 **Agent Spawning** - Spawn autonomous agents via MCP tools
- 🤝 **Agent Collaboration** - Agents discover and communicate with each other
- 👁️ **Manual Oversight** - Attach to agent sessions via CLI or WebSocket
- 📂 **Shared Workspace** - All agents work on the same codebase
- 🔒 **Isolated Execution** - Each agent runs in its own Docker container
- 🎯 **Zero Installation** - Runs via `npx`, no global installation needed

## Use Case

Enable Claude to delegate complex software tasks to specialized agents:

```
Claude: "Build a full-stack user authentication system"
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
- **Claude Desktop** - Or any MCP-compatible client

## Documentation

- 📋 [Product Requirements (PRD)](docs/PRD.md) - Functional requirements and user personas
- 🏗️ [Architecture](docs/ARCHITECTURE.md) - Technology-agnostic system design
- 🔧 [Design](docs/DESIGN.md) - TypeScript/Docker implementation details

## Status

🚧 **In Design Phase** - Documentation complete, implementation in progress.

## Quick Start (Future)

### 1. Setup Claude Desktop

Add to your Claude Desktop configuration file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%/Claude/claude_desktop_config.json`
**Linux**: `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "crowd-mcp": {
      "command": "npx",
      "args": ["-y", "crowd-mcp@latest"]
    }
  }
}
```

Restart Claude Desktop. The server will start automatically when Claude launches.

### 2. Use in Claude Desktop

```
You: "Spawn an agent to refactor the authentication module"

Claude: [Uses spawn_agent tool]
        Agent-123 created and working on task...

You: "What agents are running?"

Claude: [Uses list_agents tool]
        - Agent-123: Refactoring auth module (working)
```

### 3. Operator CLI (Optional)

Monitor and control agents from your terminal:

```bash
# List all running agents
npx crowd-mcp-cli list

# Attach to an agent's interactive session
npx crowd-mcp-cli attach agent-123

# View agent logs
npx crowd-mcp-cli logs agent-123

# Stop an agent
npx crowd-mcp-cli stop agent-123
```

The CLI communicates with the MCP server that's running via Claude Desktop.

## How It Works

```
┌─────────────────────────────────────────────────────┐
│              Claude Desktop (MCP Client)             │
└────────────────────┬────────────────────────────────┘
                     │ stdio (MCP Protocol)
                     │
┌────────────────────▼────────────────────────────────┐
│              crowd-mcp MCP Server                    │
│  ┌────────────────────────────────────────────────┐ │
│  │ Management Tools (for Claude)                  │ │
│  │  - spawn_agent    - list_agents                │ │
│  │  - get_status     - stop_agent                 │ │
│  └────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────┐ │
│  │ Agent Collaboration Tools (for agents)         │ │
│  │  - discover_agents  - send_to_agent            │ │
│  │  - broadcast        - get_my_messages          │ │
│  └────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────┐ │
│  │ Operator API (HTTP + WebSocket)                │ │
│  │  - CLI commands   - TTY attach                 │ │
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
```

**Key Components:**

1. **MCP Server** - Runs as child process of Claude Desktop, provides MCP tools
2. **Agent Containers** - Isolated Docker containers running OpenCode (AI coding agent)
3. **Message Router** - Enables agent-to-agent communication
4. **Attach Manager** - Allows operators to connect to agent sessions
5. **Shared Workspace** - Mounted volume accessible to all agents

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
│   ├── server/       # MCP server + CLI implementation
│   └── shared/       # Shared types and utilities
├── docker/
│   └── agent/        # Agent container Dockerfile
└── docs/             # Documentation
```

## Contributing

Contributions welcome! Please read the documentation first:

1. Check [open issues](https://github.com/mrsimpson/crowd-mcp/issues)
2. Review the [Architecture](docs/ARCHITECTURE.md) and [Design](docs/DESIGN.md) docs
3. Submit a PR with tests

## Related Projects

- [Model Context Protocol](https://modelcontextprotocol.io/) - Protocol specification
- [OpenCode](https://github.com/sst/opencode) - AI coding agent used in containers
- [Claude Desktop](https://claude.ai/download) - MCP client

## Roadmap

**v0.1** (Current)
- Basic agent spawning and management
- Agent-to-agent messaging
- CLI attach functionality

**v0.2**
- Persistent message queue
- Agent state recovery
- Resource usage tracking

**v0.3**
- Standalone binary distribution
- Advanced agent scheduling
- Web UI for monitoring

## License

MIT

## Authors

Created by [Oliver Simpson](https://github.com/mrsimpson)
