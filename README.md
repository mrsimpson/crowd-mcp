# crowd-mcp

MCP server for spawning and managing autonomous AI agents in Docker containers.

## Overview

crowd-mcp enables:
- Spawning autonomous AI agents via MCP protocol
- Agent-to-agent communication
- Manual operator intervention via CLI/WebSocket
- Shared workspace collaboration

## Documentation

- [Product Requirements (PRD)](docs/PRD.md) - What the system does
- [Architecture](docs/ARCHITECTURE.md) - How it's structured (technology-agnostic)
- [Design](docs/DESIGN.md) - Implementation details (TypeScript + Docker)

## Status

🚧 **In Design Phase** - Documentation complete, implementation pending.

## Quick Start (Future)

### MCP Client Setup (Claude Desktop)

Add to your Claude Desktop config:

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

### Operator CLI

```bash
# List agents
npx crowd-mcp-cli list

# Attach to agent
npx crowd-mcp-cli attach agent-123
```

### Development

```bash
# Clone and build
git clone https://github.com/mrsimpson/crowd-mcp
cd crowd-mcp
npm install
npm run build

# Run locally
node packages/server/dist/index.js
```

## License

MIT
