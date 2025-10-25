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
- Management Interface: Protocol-based (MCP) for AI clients
- Operator Interface: CLI and WebSocket for human operators

### 2. Orchestrator

Core business logic for agent and message management.

**Sub-Components:**

#### Agent Registry
- Maintains catalog of all agents
- Tracks agent metadata (status, capabilities, task)
- Provides discovery services

#### Message Router
- Queues messages between agents
- Routes point-to-point and broadcast messages
- Maintains message history

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
- Execute tasks independently
- Discover peer agents
- Send/receive messages
- Access shared workspace

### 5. Workspace

Shared filesystem accessible to all agents.

**Properties:**
- Mounted from host system
- Read/write access for all agents
- Changes immediately visible across agents

## Communication Flows

### Flow 1: Agent Spawning

```
AI Client → Management Interface → Orchestrator
           → Agent Registry (register)
           → Container Runtime (create & start)
           → Agent (initialize)
```

### Flow 2: Agent Discovery

```
Agent → Management Interface → Agent Registry
      → Return filtered agent list
```

### Flow 3: Inter-Agent Messaging

```
Agent-1 → Message Router → Message Queue (Agent-2)
Agent-2 → Message Router → Poll Queue
        → Receive messages
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
- Source: Agents
- Storage: Message Router (per-agent queues)
- Delivery: Pull-based (agents poll)
- Retention: Until read or TTL expires

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
- In-memory state (no persistence)
- Maximum agents limited by host resources

## Failure Modes & Recovery

### Agent Crash
- Container stops
- Registry marks agent as failed
- Pending messages remain queued
- No automatic restart

### Orchestrator Crash
- All agent containers continue running
- Message queue lost (in-memory)
- Registry lost (in-memory)
- Operator must manually restart orchestrator

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
- Add persistence layer
- Implement retry mechanisms
- Add acknowledgment protocol

### Advanced Discovery
- Capability-based routing
- Load-based agent selection
- Health checks and automatic failover
