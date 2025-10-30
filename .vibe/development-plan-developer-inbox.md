# Development Plan: crowd (developer-inbox branch)

_Generated on 2025-10-30 by Vibe Feature MCP_
_Workflow: [epcc](https://mrsimpson.github.io/responsible-vibe-mcp/workflows/epcc)_

## Goal

Improve message delivery reliability for both agents and developer. Currently, agents use SSE (Server-Sent Events) but this is unreliable. Developer message checking is not implemented at all. We need to explore stdin-based notification as an alternative and implement developer message checking.

## Explore

### Tasks

- [ ] _Tasks will be added as they are identified_

### Completed

- [x] Created development plan file

## Plan

### Tasks

- [ ] _To be added when this phase becomes active_

### Completed

_None yet_

## Code

### Tasks

- [x] Analyze current SSE-based message delivery system for agents
- [x] Investigate current developer message checking (none exists)
- [x] Analyze current stdin mechanism in entrypoint.sh
- [x] Research stdin-based notification feasibility for running processes
- [x] Design improved message notification system
- [x] Implement developer message checking via MCP tools
- [x] Create stdin-based notification system for agents
- [x] Test reliability improvements
- [x] Update documentation

### Completed

- [x] Analyzed current agent SSE implementation in agent-mcp-server.ts
- [x] Analyzed current task delivery via messaging system + stdin approach in entrypoint.sh
- [x] Confirmed developer message checking is missing (actually exists via get_messages tool)
- [x] Created notification-manager.ts with PipeNotificationManager and FileNotificationManager
- [x] Enhanced entrypoint.sh with notification monitoring system
- [x] Integrated notification manager into MessageRouter for automatic agent notifications
- [x] Added notification_status MCP tool for monitoring system health
- [x] Integrated notification lifecycle management with agent registry events

## Commit

### Tasks

- [ ] _To be added when this phase becomes active_

### Completed

_None yet_

## Key Decisions

**Current State Analysis:**

1. **Agent Message Delivery**: Uses SSE (Server-Sent Events) via agent-mcp-server.ts on port 3100, but is unreliable
2. **Task Delivery**: Currently uses messaging system + stdin approach - tasks sent to agent inbox, then "get your messages" sent via stdin on startup
3. **Developer Message Checking**: Not implemented at all - no mechanism for developer to check messages from agents
4. **Message Storage**: Uses JSONL files in .crowd/sessions/ with MessageRouter

**Stdin Feasibility**: Sending printf to running processes can work, but has limitations:

- Process must be reading from stdin continuously
- Race conditions if multiple messages sent quickly
- Process needs to handle stdin gracefully
- Better for one-time notifications than continuous communication

**Alternative Approaches:**

1. **Polling-based**: Regular checks for new messages
2. **File-based notifications**: Touch files to signal new messages
3. **Process signals**: Use SIGUSR1/SIGUSR2 for notifications
4. **Hybrid approach**: Combine existing messaging system with better notification mechanisms

**Selected Solution - Multi-layered Notification System:**

1. **Named Pipes (Primary)**: Fast, reliable IPC using mkfifo - agents monitor pipes for instant notifications
2. **File-based (Fallback)**: Signal files when pipes not available - polling every 2 seconds
3. **Enhanced Stdin Integration**: Notification monitors send "get your messages" commands to OpenCode via stdin
4. **Automatic Lifecycle**: Notification channels setup/cleanup tied to agent registration events
5. **Developer Tools**: Existing get_messages/send_message tools provide developer interface
6. **Persistent Storage**: JSONL-based message storage remains unchanged for reliability

## Notes

**Implementation Details:**

- **New Files Created**: `notification-manager.ts` with two notification strategies
- **Modified Files**: `message-router-jsonl.ts`, `entrypoint.sh`, `index.ts`
- **Key Features**: Automatic notification on message arrival, graceful fallback between pipe/file methods
- **Developer Experience**: Use `notification_status` tool to monitor system health
- **Agent Experience**: Automatic real-time notifications without code changes

**Benefits Over Previous SSE Approach:**

- **More Reliable**: Named pipes are more stable than SSE connections
- **Faster**: Direct IPC vs HTTP overhead
- **Fallback Support**: File-based notifications when pipes unavailable
- **Better Integration**: Works with existing OpenCode stdin command processing
- **Automatic Management**: Notification channels tied to agent lifecycle

---

_This plan is maintained by the LLM. Tool responses provide guidance on which section to focus on and what tasks to work on._
