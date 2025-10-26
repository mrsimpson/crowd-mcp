# Agent Container

This directory contains the Dockerfile for the autonomous agent container used by crowd-mcp.

## What's Inside

- **Node.js 20 Alpine** - Lightweight Node.js runtime
- **OpenCode** - AI-powered autonomous coding agent
- **Workspace** - Mounted volume for shared code access

## Building the Image

```bash
# From the project root
docker build -t crowd-mcp-agent:latest docker/agent/

# Or with a specific tag
docker build -t crowd-mcp-agent:v0.1.0 docker/agent/
```

## Usage

This image is used automatically by the `ContainerManager` when spawning agents via the `spawn_agent` MCP tool. You don't need to run it manually.

The container manager will:

1. Start a container from this image
2. Mount the workspace directory
3. Execute the agent's task via OpenCode

## Manual Testing

If you want to test the container manually:

```bash
# Run the container
docker run -d \
  --name test-agent \
  -v $(pwd):/workspace \
  crowd-mcp-agent:latest

# Attach to the running container
docker exec -it test-agent sh

# Inside the container, you can run OpenCode
opencode --help
```

## Container Lifecycle

- **Start**: Container starts with `tail -f /dev/null` to keep it running
- **Task Execution**: OpenCode runs within the container
- **Stop**: Container is stopped and removed by the MCP server when the agent is terminated
