# Architecture: crowd-mcp

## System Overview

crowd-mcp is a multi-interface orchestration system that manages autonomous agents in isolated execution environments. The system provides two primary interfaces: one for AI-driven management and another for agent collaboration.

## Core Principles

1. **Isolation**: Each agent runs in its own isolated environment
2. **Shared State**: All agents access a common workspace
3. **Message-Based Communication**: Agents communicate via asynchronous messaging
4. **Manual Override**: Operators can intervene in any agent session
5. **Protocol Consistency**: All interfaces use the same underlying protocol (MCP)

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Control Plane                         │
├──────────────────────┬──────────────────────────────────┤
│  Management Interface│     Operator Interface            │
│  (AI Client)         │     (Human Access)                │
└──────────────────────┴──────────────────────────────────┘
           │                        │
           └────────┬───────────────┘
                    │
         ┌──────────▼──────────┐
         │   Orchestrator      │
         │   - Agent Registry  │
         │   - Message Router  │
         │   - Attach Manager  │
         └──────────┬──────────┘
                    │
      ┌─────────────┼─────────────┐
      │             │             │
┌─────▼─────┐ ┌────▼──────┐ ┌────▼──────┐
│ Container │ │ Container │ │ Container │
│  Agent-1  │ │  Agent-2  │ │  Agent-3  │
└───────────┘ └───────────┘ └───────────┘
      │             │             │
      └─────────────┴─────────────┘
                    │
              ┌─────▼──────┐
              │  Workspace │
              │  (Shared)  │
              └────────────┘
```

## Components

### 1. Control Plane

Central coordination layer that manages all system operations.

**Responsibilities:**

- Accept requests from external interfaces
- Validate and route commands
- Maintain system state
- Enforce policies and limits

**Interfaces:**

- **Management Interface**: MCP over stdio for AI clients/developers
  - Tools: spawn_agent, list_agents, stop_agent, send_message, get_messages, etc.
  - Port: stdio (standard input/output)
- **Agent Interface**: MCP over SSE for agents in containers
  - Tools: send_message, get_messages, discover_agents, mark_messages_read
  - Port: 3100 (configurable via AGENT_MCP_PORT)
- **Operator Interface**: HTTP/WebSocket for human operators
  - Web Dashboard for monitoring agents and message visualization
  - Real-time message display with filtering and thread organization
  - Port: 3000 (configurable via HTTP_PORT)

### 2. Orchestrator

Core business logic for agent and message management.

**Sub-Components:**

#### Agent Registry

- Maintains catalog of all agents
- Tracks agent metadata (status, capabilities, task)
- Provides discovery services

#### Message Router

- **Implementation**: JSONL file-based persistent storage
- **Location**: `./.crowd/sessions/{timestamp}/messages.jsonl`
- **Key Features**:
  - Point-to-point and broadcast messaging
  - Task delivery via messaging system + stdin
  - Priority-based message queuing (high > normal > low)
  - Persistent storage across server restarts
  - Session-based organization for debugging

**Interfaces**:

- Management Interface (stdio): For developer/AI client
- Agent Interface (SSE): For agents in containers (port 3100)

**📖 See**: `docs/MESSAGING_ARCHITECTURE.md` for complete implementation details, API reference, and task delivery architecture

#### Attach Manager

- Handles terminal attachment to agents
- Multiplexes multiple simultaneous connections
- Manages TTY streams

### 3. Container Runtime

Execution environment for agents.

**Characteristics:**

- Isolated process space
- Resource-limited (CPU, Memory)
- Network-connected for inter-agent communication
- Shared volume mount for workspace access

### 4. Agent

Autonomous AI instance running within container.

**Capabilities:**

- **Task Execution**: Receive and execute tasks via messaging system
- **Inter-Agent Communication**: Discover peer agents and exchange messages
- **Workspace Access**: Read/write shared filesystem
- **Status Reporting**: Report completion and progress via messaging

**Task Delivery Process**:

- Tasks delivered via messaging system during spawn
- Automatic task retrieval on startup via stdin command
- Persistent task storage ensures reliable delivery

### 5. Workspace

Shared filesystem accessible to all agents.

**Properties:**

- Mounted from host system
- Read/write access for all agents
- Changes immediately visible across agents

## Communication Flows

### Flow 1: Agent Spawning & Task Delivery ⭐ **UPDATED**

```
AI Client → Management Interface → Orchestrator
           → Agent Registry (register)
           → Message Router (send task to inbox)
           → Container Runtime (create & start)
           → Agent (initialize, get messages via stdin, execute task)
```

### Flow 2: Agent Discovery

```
Agent → Agent Interface (SSE) → Agent Registry
      → Return filtered agent list
```

### Flow 3: Inter-Agent Messaging

```
Agent-1 → Agent Interface (SSE) → Message Router → Message Inbox (Agent-2)
Agent-2 → Agent Interface (SSE) → Message Router → Retrieve messages
        → Process messages
```

### Flow 4: Task Delivery Process ⭐ **NEW**

```
1. Agent Spawn → Task sent to message inbox (persistent storage)
2. Container Start → entrypoint.sh sends "get your messages" via stdin
3. OpenCode Start → Executes get_messages MCP tool automatically
4. Task Retrieved → Agent processes task through normal workflow
5. Status Updates → Agent reports completion via messaging system
```

### Flow 4: Operator Attach

```
Operator → CLI/WebSocket → Attach Manager
         → Container Runtime (attach TTY)
         → Bidirectional Stream (operator ↔ agent)
```

## Data Flow

### Agent Metadata

- Source: Agents self-report
- Storage: Agent Registry (in-memory)
- Consumers: Discovery queries, status checks

### Messages

- **Source**: Agents and Developers
- **Storage**: JSONL files (`./.crowd/sessions/{timestamp}/messages.jsonl`)
- **Persistence**: Across server restarts (session-based)
- **Delivery**: Pull-based via MCP tools (`get_messages`)
- **Retention**: Persistent (no automatic cleanup currently)

### Workspace Files

- Source: Agents write to filesystem
- Storage: Host filesystem
- Propagation: Immediate (shared mount)

## Isolation & Security Model

### Process Isolation

- Each agent in separate process namespace
- No shared memory between agents
- No direct process signals

### Filesystem Isolation

- Separate root filesystem per agent
- Shared workspace via explicit mount only
- Read-only system directories

### Network Isolation

- Agents in private network
- Only orchestrator and agent containers can communicate
- No direct agent-to-agent networking (all via message router)

### Resource Isolation

- CPU quota per agent
- Memory limit per agent
- Process count limit per agent

## Scaling Considerations

### Vertical Scaling

- Increase host resources to support more agents
- Tune per-agent limits down to fit more agents

### Horizontal Scaling (Future)

- Multiple orchestrator instances
- Distributed message queue
- Agent affinity to hosts

### Current Limitations

- Single host only
- Agent Registry state is in-memory (lost on restart)
- Message history is persistent but grows unbounded (no cleanup)
- Maximum agents limited by host resources
- Basic authentication for agents (query parameter based)

## Failure Modes & Recovery

### Agent Crash

- Container stops
- Registry marks agent as failed
- Pending messages remain queued
- No automatic restart

### Orchestrator Crash

- All agent containers continue running
- Message history preserved (JSONL files)
- Agent Registry lost (in-memory) - agents need re-registration
- Operator must manually restart orchestrator
- Previous session messages remain accessible in filesystem

### Network Partition

- Agents cannot discover each other
- Messages cannot be delivered
- Attach operations fail
- Workspace access unaffected

## Extension Points

### Custom Agent Types

- Support different container images
- Different runtime environments (not just OpenCode)

### Message Delivery Guarantees

- ✅ **Task Delivery**: Messaging system + stdin approach (reliable, immediate)
- ✅ **Persistence**: JSONL-based storage across server restarts
- ✅ **Agent Communication**: SSE-based real-time messaging
- 🔜 **Future**: Retry mechanisms, acknowledgment protocol, TTL cleanup

### Advanced Discovery

- Capability-based routing
- Load-based agent selection
- Health checks and automatic failover

## 📚 Documentation Structure

This document provides the **high-level system architecture**. For detailed implementations:

- **📨 Messaging System**: `docs/MESSAGING_ARCHITECTURE.md`
  - Complete message router implementation
  - Task delivery architecture (messaging + stdin)
  - SSE-based agent communication
  - API reference and data flows

- **🏗️ Design Details**: `docs/DESIGN.md`
  - Component interfaces and contracts
  - Docker configuration and networking
  - Development and deployment processes

- **📋 Product Requirements**: `docs/PRD.md`
  - Feature specifications and use cases
  - Business requirements and goals
