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

```bash
# Install
npm install -g crowd-mcp

# Configure
crowd-mcp init

# Run MCP server
crowd-mcp serve
```

## License

MIT
