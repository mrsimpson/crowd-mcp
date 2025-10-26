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

## Open Questions

1. Should agents persist state between restarts?
2. Should we support agent migration between hosts?
3. How should we handle agent deadlocks/infinite loops?

## Out of Scope (Future Versions)

- Agent authentication/authorization
- Agent capability negotiation protocols
- Distributed deployment across multiple hosts
- Agent-to-agent direct networking (bypassing message queue)
- Web UI for operator interface (v1 is CLI + WS API only)
