# Product Requirements Document: crowd-mcp

## Overview

crowd-mcp is an MCP (Model Context Protocol) server that enables spawning and managing autonomous AI agents in isolated container environments. Agents can work independently on tasks, communicate with each other, and be manually supervised when needed.

## Problem Statement

Current AI coding assistants operate as single agents. Complex software projects often require:

- Multiple specialized agents working in parallel
- Agent collaboration and task delegation
- Manual intervention capability when agents need guidance
- Shared workspace access for coordinated development

## Goals

### Primary Goals

1. Enable spawning of autonomous AI agents via MCP protocol
2. Provide agent-to-agent communication mechanisms
3. Allow operators to manually attach to running agents
4. Share workspace between agents for collaborative work
5. Support configurable agent templates with custom behavior and tools

### Non-Goals

- Multi-host orchestration (single-host only in v1)
- Agent code execution sandboxing beyond container isolation
- Long-term agent persistence across system restarts

## User Personas

### Persona 1: AI Assistant (Claude via MCP Client)

**Needs:**

- Spawn agents for delegated tasks
- Monitor agent status
- Coordinate multiple agents
- Receive results from agents

### Persona 2: System Operator

**Needs:**

- View all running agents
- Attach to agent sessions for debugging
- Monitor resource usage
- Manually intervene when agents are stuck

### Persona 3: AI Agent (OpenCode in Container)

**Needs:**

- Discover other agents
- Send/receive messages to/from peers
- Access shared workspace
- Report status and progress

## Functional Requirements

### FR1: Agent Lifecycle Management

- FR1.1: Spawn new agent with task description
- FR1.2: List all active agents with status
- FR1.3: Stop running agent
- FR1.4: Automatic cleanup of completed agents

### FR2: Agent Communication

- FR2.1: Agent can discover all active agents
- FR2.2: Agent can send direct message to another agent
- FR2.3: Agent can broadcast message to all agents
- FR2.4: Agent can retrieve its incoming messages
- FR2.5: Agent can update its own status/metadata

### FR3: Operator Access

- FR3.1: Operator can list all agents via CLI
- FR3.2: Operator can attach to agent's interactive session via CLI
- FR3.3: Operator can attach to agent's session via WebSocket (for web UI)
- FR3.4: Operator can view agent logs
- FR3.5: Multiple operators can attach to same agent simultaneously

### FR4: Shared Workspace

- FR4.1: All agents access same filesystem location
- FR4.2: Changes by one agent are visible to others
- FR4.3: Workspace mounted from MCP server's working directory

### FR5: Resource Management

- FR5.1: Per-agent memory limits
- FR5.2: Per-agent CPU limits
- FR5.3: Maximum concurrent agents limit

### FR6: Web Dashboard (Operator Interface)

- FR6.1: Real-time agent list with automatic updates (no polling)
- FR6.2: View agent details (ID, task, container ID, status)
- FR6.3: Stop running agent from web UI
- FR6.4: View agent logs from web UI
- FR6.5: Connection status indicator
- FR6.6: Error handling and user feedback
- FR6.7: Responsive design for desktop and mobile

### FR7: Agent Configuration

- FR7.1: Define agent templates with system prompts, models, and capabilities
- FR7.2: Configure MCP servers per agent (stdio and streamable HTTP)
- FR7.3: Support CLI-agnostic agent definitions
- FR7.4: Generate CLI-specific configurations at runtime
- FR7.5: Automatic injection of messaging MCP server
- FR7.6: Environment variable templating and resolution
- FR7.7: Default agent selection when no agent type specified
- FR7.8: Model preference lists with fallback support

#### FR7.1: Agent Templates

Agents are pre-defined templates stored in `.crowd/agents/*.yaml` with:

- **System Prompt**: CLI-agnostic prompt that defines agent behavior
- **Preferred Models**: Priority list of models (e.g., `anthropic.claude-sonnet-4`)
- **LLM Settings**: Temperature, reasoning effort, etc.
- **Capabilities**: Tags for agent discovery (e.g., `architecture`, `testing`)

#### FR7.2: MCP Server Configuration

Each agent can configure multiple MCP servers:

- **Stdio MCP**: Command-based servers (e.g., filesystem, git)
  - Command, arguments, and environment variables
  - Support for `${HOST_ENV}` templates
- **HTTP MCP**: Remote streamable HTTP servers
  - URL and headers configuration
  - Support for authentication tokens via templates

#### FR7.3: CLI Abstraction

Agent definitions are CLI-agnostic and converted to CLI-specific formats:

- **Agent Definition Layer**: YAML files with CLI-agnostic configuration
- **CLI Adapter Layer**: Converts agent definition to CLI-specific format
- **Runtime Generation**: Config generated per agent instance at spawn time

#### FR7.4: Messaging Integration

Every agent automatically receives:

- \*\*Messaging MCP Server: Streamable HTTP connection to orchestrator
- **URL Format**: `http://host.docker.internal:3100/mcp`
- **Tools**: send_message, get_messages, discover_agents, mark_messages_read

#### FR7.5: Environment Variable Resolution

Templates in agent configuration are resolved at runtime:

- **Format**: `${VARIABLE_NAME}` in YAML configuration
- **Resolution**: From host environment variables
- **Fallback**: Empty string if variable not found (no error)

#### FR7.6: Configuration Structure

```
.crowd/
├── config.yaml                 # Global settings (CLI choice, default agent)
├── agents/                     # Agent template definitions
│   ├── architect.yaml
│   ├── coder.yaml
│   └── reviewer.yaml
├── runtime/                    # Generated configs (per agent instance)
│   └── agents/
│       └── {agentId}/
│           └── opencode.json   # Generated CLI config
└── opencode/                   # Global provider config
    ├── opencode.json           # LLM providers
    └── .env.local             # API keys
```

## Non-Functional Requirements

### NFR1: Isolation

- Each agent runs in isolated container
- Container failures don't affect other agents
- Agents cannot access each other's processes

### NFR2: Observability

- All agent messages are logged
- Resource usage is trackable per agent
- Agent lifecycle events are auditable

### NFR3: Usability

- CLI attach provides full TTY experience
- WebSocket attach supports terminal emulation
- Agent discovery returns actionable metadata

## Success Metrics

1. **Agent spawn time**: < 5 seconds from request to ready
2. **Message delivery**: < 1 second between agents
3. **Attach latency**: < 500ms from command to interactive session
4. **Resource overhead**: < 200MB RAM per idle agent
5. **Config generation**: < 100ms to generate CLI config from agent definition

## Open Questions

1. Should agents persist state between restarts?
2. Should we support agent migration between hosts?
3. How should we handle agent deadlocks/infinite loops?
4. Should agent configurations support inheritance (e.g., base agent + specializations)?
5. Should we validate agent configurations at server startup or lazy-load?
6. How should we handle missing MCP server dependencies in agent configs?

## Implementation Status

### ✅ Completed

- **FR1: Agent Lifecycle Management** - Fully implemented
  - FR1.1-FR1.3: spawn_agent, list_agents, stop_agent
- **FR2: Agent Communication** - Fully implemented
  - FR2.1: discover_agents tool
  - FR2.2: send_message (direct messaging)
  - FR2.3: send_message with to='broadcast'
  - FR2.4: get_messages tool
  - Message persistence via JSONL files
  - Agent MCP Server (streamable HTTP-based) on port 3100
- **FR4: Shared Workspace** - Fully implemented
  - Workspace mounted via Docker volumes
- **FR6: Web Dashboard** - Fully implemented
  - Real-time agent monitoring via streamable HTTP
  - Web UI on port 3000

### 🚧 Partially Implemented

- **FR2.5**: Agent status updates - Not yet exposed as tool
- **FR3: Operator Access** - CLI attach not implemented
- **FR5: Resource Management** - Not implemented

### 📋 Planned

- **FR7: Agent Configuration** - Not yet implemented
  - FR7.1-FR7.8: Agent templates, MCP server configuration, CLI adapters
  - Target: Enable pre-configured agent types with custom system prompts and tools

### 📋 Implementation Details

- **Messaging System**: JSONL file-based storage (`./.crowd/sessions/{timestamp}/`)
- \*\*Agent Interface: MCP over streamable HTTP (port 3100)
- **Management Interface**: MCP over stdio
- **Web Dashboard**: Express + WebSocket (port 3000)

For detailed messaging architecture, see: `docs/MESSAGING_ARCHITECTURE.md`

## Out of Scope (Future Versions)

- Advanced agent authentication/authorization (cryptographic signatures)
- Agent capability negotiation protocols
- Distributed deployment across multiple hosts
- Agent-to-agent direct networking (bypassing message queue)
- Message TTL and automatic cleanup
- Agent configuration hot-reloading without restart
- Configuration versioning and rollback
- Agent configuration inheritance and composition
- Dynamic MCP server installation/provisioning
