# Agent Spawning Capability

## Overview

The agent spawning capability allows agents to create and manage child agents to help complete tasks. This enables hierarchical task delegation and parallel execution within the crowd-mcp system.

## Configuration

To enable spawning for an agent, add the `spawning` section to the agent's YAML configuration:

```yaml
name: orchestrator
systemPrompt: |
  You are an orchestrator agent...

spawning:
  enabled: true # Whether this agent can spawn child agents
  maxSpawns: 3 # Maximum number of child agents this agent can spawn
```

### Configuration Fields

- **`enabled`** (boolean, required): Whether the agent is allowed to spawn child agents
- **`maxSpawns`** (number, required): Maximum number of agents this agent can spawn. Must be >= 0.

## Available Tools

When spawning is enabled for an agent, it gains access to two additional MCP tools:

### 1. `spawn_agent`

Spawns a new child agent to work on a specific task.

**Parameters:**

- `task` (string, required): The task for the child agent to perform
- `agentType` (string, optional): The type of agent to spawn (from `.crowd/agents/{agentType}.yaml`)
- `workspace` (string, optional): The workspace directory for the agent (defaults to parent's workspace)

**Returns:**

```json
{
  "success": true,
  "agentId": "agent-1761891234567",
  "containerId": "abc123...",
  "task": "The assigned task",
  "remainingSpawns": 2,
  "message": "Agent spawned successfully. You have 2 spawns remaining."
}
```

**Example Usage:**

```json
{
  "task": "Write unit tests for the authentication module",
  "agentType": "worker"
}
```

### 2. `get_spawn_status`

Gets information about the agent's spawning status.

**Parameters:** None

**Returns:**

```json
{
  "canSpawn": true,
  "spawned": 1,
  "maxSpawns": 3,
  "remainingSpawns": 2
}
```

## How It Works

### 1. Spawn Tracking

The system tracks parent-child relationships between agents using the `SpawnTracker` service:

- Records which agents spawned which other agents
- Enforces spawn limits per agent
- Cleans up tracking data when agents are stopped

### 2. Agent Communication

Spawned agents communicate with their parents via the messaging system:

- Parent sends initial task via high-priority message
- Child reports completion status back to parent
- All agent-to-agent messaging uses the existing messaging infrastructure

### 3. Spawn Limits

Spawn limits are enforced at spawn time:

- Each agent can only spawn up to its configured `maxSpawns` limit
- Attempts to exceed the limit result in an error
- Limits are per-agent (not hierarchical)

### 4. SSE-Based Internal MCP Server

Spawning tools are exposed via the same SSE-based MCP server used for messaging:

- Tools are only available to agents with spawning enabled
- Tools are dynamically included based on agent configuration
- Reuses existing infrastructure (DRY principle)

## Example Configurations

### Orchestrator Agent (Multiple Spawns)

```yaml
name: orchestrator
systemPrompt: |
  You are an orchestrator agent that breaks down complex tasks
  and delegates to specialized agents.

spawning:
  enabled: true
  maxSpawns: 5

capabilities:
  - orchestration
  - task-decomposition
```

### Supervisor Agent (Limited Spawning)

```yaml
name: supervisor
systemPrompt: |
  You can delegate one subtask while working on the main task.

spawning:
  enabled: true
  maxSpawns: 1

capabilities:
  - supervision
  - code-review
```

### Worker Agent (No Spawning)

```yaml
name: worker
systemPrompt: |
  You are a focused worker agent that executes specific tasks.

# No spawning section = no spawning capability

capabilities:
  - coding
  - testing
```

## Architecture

### Components

1. **SpawnTracker** (`src/core/spawn-tracker.ts`)
   - Tracks parent-child relationships
   - Enforces spawn limits
   - Provides spawn count and status queries

2. **SpawningTools** (`src/mcp/spawning-tools.ts`)
   - Implements `spawn_agent` and `get_spawn_status` tools
   - Validates spawning permissions
   - Coordinates with ContainerManager and AgentRegistry

3. **AgentMcpServer** (`src/mcp/agent-mcp-server.ts`)
   - Exposes spawning tools to agents via SSE
   - Dynamically includes tools based on agent configuration
   - Handles tool calls and errors

### Data Flow

```
Agent (with spawning enabled)
    ↓ (calls spawn_agent via MCP)
AgentMcpServer
    ↓ (validates and routes)
SpawningTools
    ↓ (checks limits via SpawnTracker)
    ↓ (spawns via ContainerManager)
    ↓ (registers via AgentRegistry)
    ↓ (sends task via MessageRouter)
Child Agent created and starts working
```

## Best Practices

### For Agent Configuration

1. **Limit spawns appropriately**: Set `maxSpawns` based on expected task complexity
2. **Use specific agent types**: Spawn the right agent type for each subtask
3. **Document spawning in system prompt**: Explain to the agent when and how to use spawning

### For Agent Behavior

1. **Check status first**: Use `get_spawn_status` before attempting to spawn
2. **Provide clear tasks**: Give child agents specific, well-defined tasks
3. **Wait for completion**: Use messaging to coordinate with child agents
4. **Handle errors**: Be prepared for spawn failures (limit reached, etc.)

### For System Design

1. **Avoid deep hierarchies**: Limit agent spawning to 2-3 levels deep
2. **Monitor resource usage**: Each agent consumes Docker container resources
3. **Use appropriate limits**: Balance capability with resource constraints

## Testing

Comprehensive tests are available in:

- `src/core/spawn-tracker.test.ts` - SpawnTracker unit tests
- `src/mcp/spawning-tools.test.ts` - SpawningTools unit tests

Run tests with:

```bash
npm test -- spawn-tracker.test.ts spawning-tools.test.ts
```

## Implementation Notes

- **DRY Principle**: Reuses existing ContainerManager, MessageRouter, and SSE infrastructure
- **Test-Driven**: Implemented with comprehensive test coverage
- **Backward Compatible**: Agents without spawning config work as before
- **Configurable**: Per-agent control over spawning capability and limits
- **Tracked**: Full parent-child relationship tracking with automatic cleanup
