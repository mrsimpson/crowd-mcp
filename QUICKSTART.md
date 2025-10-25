# Quick Start - MVP

## Prerequisites

1. **Docker** must be running
2. **Node.js 20+** installed
3. **pnpm 9+** installed

## Setup

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Build agent Docker image
docker build -t crowd-mcp-agent:latest ./docker/agent
```

## Test the MVP

### 1. Test MCP Server (spawn_agent)

```bash
# Start MCP server (stdio mode)
node packages/server/dist/index.js

# In another terminal, test with MCP inspector (if available)
# Or use Claude Desktop config (see README.md)
```

### 2. Test CLI attach

```bash
# After spawning an agent via MCP, attach to it:
node packages/server/dist/cli.js attach agent-<timestamp>

# You should see a shell inside the container
# Type 'exit' to detach
```

## Example Flow

```bash
# Terminal 1: Start MCP server
node packages/server/dist/index.js

# Terminal 2: Spawn agent (via MCP tool)
# spawn_agent({ task: "Test task" })
# Returns: agent-1730000000000

# Terminal 3: Attach to agent
node packages/server/dist/cli.js attach 1730000000000
```

## Development

```bash
# Watch mode (auto-rebuild on changes)
pnpm dev

# Run tests
pnpm test
```
