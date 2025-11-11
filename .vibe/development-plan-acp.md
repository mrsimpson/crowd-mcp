# Development Plan: crowd (acp branch)

_Generated on 2025-11-11 by Vibe Feature MCP_
_Workflow: [epcc](https://mrsimpson.github.io/responsible-vibe-mcp/workflows/epcc)_

## Goal

Replace the current stdin-based communication with containerized agents with Agent Client Protocol (ACP) based communication. The MCP server should listen to messages from the message server and forward them to agents using ACP, solving the issue with TUI applications like OpenCode in containers.

## Explore

### Phase Entrance Criteria:

_Initial phase - no entrance criteria_

### Tasks

### Completed

- [x] Created development plan file
- [x] Researched ACP documentation and protocol structure
- [x] Analyzed current container setup and messaging system
- [x] Examined existing MCP server architecture
- [x] Identified current system: containers send `printf "get your messages\n"` to OpenCode via stdin
- [x] Found issue: TUI applications like OpenCode need interactive stdin, but current approach pipes commands
- [x] Documented current flow and identified that MCP server should be ACP client, OpenCode should be ACP agent
- [x] Analyzed ACP protocol: agents handle prompts, clients provide filesystem/terminal access
- [x] Found TypeScript ACP SDK available on npm with examples
- [x] Identified architecture: MCP server acts as ACP client, forwards messages as prompts to OpenCode agent
- [x] Mapped ACP methods needed: initialize, session/new, session/prompt from client to agent
- [x] Designed ACP session lifecycle for containers
- [x] Identified integration points with existing message router

## Plan

### Phase Entrance Criteria:

- [x] Current stdin-based system is fully understood
- [x] ACP protocol requirements are clearly documented
- [x] Technical challenges and constraints are identified
- [x] Integration points with existing messaging system are mapped
- [x] Architecture for ACP-based communication is designed

### Tasks

- [x] Design ACP client architecture and integration points
- [x] Plan ACP TypeScript SDK integration and dependency management
- [x] Design container startup changes and entrypoint modifications
- [x] Plan message router event handling and ACP forwarding
- [x] Design error handling and connection management
- [x] Plan testing strategy for ACP integration
- [x] Confirm natural backward compatibility (no special handling needed)

### Completed

- [x] Design ACP client architecture and integration points
- [x] Plan ACP TypeScript SDK integration and dependency management
- [x] Design container startup changes and entrypoint modifications
- [x] Plan message router event handling and ACP forwarding
- [x] Design error handling and connection management
- [x] Plan testing strategy for ACP integration
- [x] Confirm natural backward compatibility (no special handling needed)

## Code

### Phase Entrance Criteria:

- [ ] Implementation plan is complete and approved
- [ ] Technical architecture is finalized
- [ ] Dependencies and integration points are clear
- [ ] Testing strategy is defined

### Tasks

- [x] Add ACP TypeScript SDK dependency to server package
- [x] Create ACPClientManager class for managing ACP connections
- [x] Create ACPContainerClient class for individual container communication
- [x] Create ACPMessageForwarder class for message conversion and routing
- [x] Integrate ACP client management into AgentMcpServer
- [x] Update ContainerManager to support ACP container connections
- [x] Modify docker entrypoint script to remove stdin piping
- [x] Update message router event handling for ACP forwarding
- [x] Implement error handling and connection recovery
- [x] Add comprehensive test coverage for ACP components
- [x] Remove MCP backwards compatibility for cleaner ACP-only implementation
- [x] Test end-to-end ACP message flow
- [x] **BREAKTHROUGH: Implement Docker exec stdin approach for ACP**
- [x] **Fix Bun package installation issues in containers**
- [x] **Validate direct RPC communication works perfectly**
- [x] **Fix message forwarding integration layer**
- [x] **Debug ACP client creation during container spawn**
- [x] **Fix timing issue in ACP handshake (increased startup delay)**
- [x] **BREAKTHROUGH: Identified missing response handling**
- [x] **Implement agent response collection and forwarding back to messaging system**
- [x] **COMPLETE: Full ACP message forwarding working end-to-end**
- [x] **Verified: Existing agents need MCP server restart to use new response handling**
- [x] **Fix OpenCode ripgrep ENOENT error by creating required directories**
- [x] **Fix timestamp conversion bug in ACP message forwarding**
- [x] **Fix MessageRouter.send() method call in response handling**
- [ ] Update documentation and add configuration examples

### Completed

- [x] Add ACP TypeScript SDK dependency to server package
- [x] Create ACPClientManager class for managing ACP connections
- [x] Create ACPContainerClient class for individual container communication
- [x] Create ACPMessageForwarder class for message conversion and routing
- [x] Integrate ACP client management into AgentMcpServer
- [x] Update ContainerManager to support ACP container connections
- [x] Modify docker entrypoint script to remove stdin piping
- [x] Update message router event handling for ACP forwarding
- [x] Implement error handling and connection recovery
- [x] Add comprehensive test coverage for ACP components
- [x] Remove MCP backwards compatibility for cleaner ACP-only implementation
- [x] Test end-to-end ACP message flow
- [x] **BREAKTHROUGH: Implement Docker exec stdin approach for ACP**
- [x] **Fix Bun package installation issues in containers**
- [x] **Validate direct RPC communication works perfectly**

## Commit

### Phase Entrance Criteria:

- [x] Core ACP implementation is complete
- [x] Integration tests pass
- [x] Container communication works without stdin
- [x] Message forwarding via ACP is functional

### Tasks

- [x] Commit complete ACP integration with bidirectional messaging

### Completed

- [x] Commit complete ACP integration with bidirectional messaging

## Key Decisions

### 1. ACP Client/Agent Role Assignment

**Decision:** MCP server acts as ACP client, OpenCode acts as ACP agent  
**Rationale:** Aligns with ACP design where editors (clients) communicate with coding agents  
**Impact:** MCP server initiates ACP connections and sends prompts to OpenCode

### 2. Direct Replacement of stdin Communication

**Decision:** Replace stdin piping with ACP communication  
**Rationale:** Solves TUI issues directly, cleaner implementation  
**Impact:** Containers get messages via ACP instead of stdin, external interfaces unchanged

### 3. Stdio Transport for ACP

**Decision:** Use stdio transport for ACP communication with containers  
**Rationale:** Direct communication path, no additional ports or networking required  
**Impact:** Simple container setup, no network configuration changes

### 5. Error Handling and Connection Recovery

**Decision:** Implement exponential backoff reconnection with health monitoring  
**Rationale:** Provides resilient ACP connections that can recover from temporary failures  
**Impact:** ACP clients automatically reconnect on connection loss, with health status tracking

### 7. Remove Backwards Compatibility

**Decision:** Remove MCP notification system, use ACP-only message forwarding  
**Rationale:** Cleaner implementation, no need to maintain dual systems  
**Impact:** Simplified codebase, agents must use ACP for message delivery

### 8. Docker Exec Stdin Approach

**Decision:** Use `docker exec -i` for ACP communication instead of container.attach()  
**Rationale:** Docker API attach() has stdin connectivity issues, exec works reliably  
**Impact:** ACP communication works perfectly, containers must be created with proper stdin flags

## Notes

### Current System Analysis

**Current Flow:**

1. Container starts with `TASK` environment variable
2. Agent configuration passed as base64-encoded `AGENT_CONFIG_BASE64`
3. OpenCode config includes messaging MCP server URL: `http://host.docker.internal:3100/mcp`
4. Container runs: `printf "get your messages\n" | exec opencode --agent $AGENT_TYPE`
5. OpenCode connects to MCP server and can use messaging tools (send_message, get_my_messages, etc.)

**Problem Identified:**

- TUI applications like OpenCode need interactive stdin for user input
- Current approach pipes a single command (`get your messages`) then closes stdin
- This prevents TUI from accepting user input properly
- OpenCode launches but can't process interactive commands

**ACP Investigation Results:**

- OpenCode source code reviewed at ~/projects/opencode
- **OpenCode does NOT support ACP protocol yet**
- No `--transport stdio` flag exists in OpenCode CLI
- No ACP agent mode implementation found
- ACP client implementation is correct but unusable until OpenCode adds support

**Current Status (2025-11-11):**

- ✅ **Docker Exec ACP Communication:** Fully functional - containers respond perfectly to direct RPC commands
- ✅ **Container Stability:** Fixed Bun installation issues, containers start reliably
- ✅ **ACP Protocol Implementation:** Correct protocol version, parameter formats, session management
- ❌ **Message Forwarding Integration:** Issue in integration layer - containers don't react to messages from crowd-mcp server
- 🔍 **Root Cause:** ACPContainerClient creates new sessions, but message forwarding may not use correct session IDs

**Test Scripts Created:**
- `test-direct-rpc.cjs` - Tests direct RPC communication to containers
- `test-prompt-direct.cjs` - Tests full prompt flow including streaming responses
- Both scripts confirm containers work perfectly with direct communication

**Next Steps:**
- Debug message forwarding integration layer
- Ensure ACPContainerClient uses correct session IDs
- Verify message routing from AgentMcpServer to containers

### Key Insight

Current system has it backwards - the MCP server should act as an ACP **client** and OpenCode should be the ACP **agent**. Messages from the message router should be forwarded as ACP prompts to OpenCode.

**ACP SDK Available:**

- TypeScript SDK: `@agentclientprotocol/sdk` on npm
- Examples available at: `https://github.com/agentclientprotocol/typescript-sdk/tree/main/src/examples`
- Has both agent and client implementations

**Required Architecture:**

1. MCP server becomes an ACP **client**
2. Container runs OpenCode as ACP **agent** on stdio
3. MCP server forwards messages from message router as ACP `session/prompt` requests
4. OpenCode responds with ACP agent responses
5. No more stdin piping - pure ACP communication

**ACP Method Mapping for Our Use Case:**

_MCP Server as ACP Client will call:_

- `initialize` - Set up connection with OpenCode agent
- `session/new` - Create new coding session with workspace context
- `session/prompt` - Send messages from message router as prompts to agent

_OpenCode as ACP Agent will implement:_

- `initialize` - Accept client connection
- `session/new` - Set up coding session with workspace access
- `session/prompt` - Receive and process coding tasks/messages

_Not needed initially:_

- Client filesystem methods (`fs/read_text_file`, `fs/write_text_file`) - OpenCode already has direct filesystem access
- Terminal methods - OpenCode can spawn terminals directly
- Most other ACP client methods - we're not building a code editor

**ACP Session Lifecycle for Containers:**

1. **Container Startup:**
   - Container starts OpenCode in ACP agent mode (stdio transport)
   - No stdin piping - OpenCode waits for ACP initialization

2. **MCP Server Connection:**
   - MCP server creates ACP client when container is ready
   - Calls `initialize` to establish ACP connection via container's stdio
   - Calls `session/new` with workspace directory and agent configuration

3. **Message Forwarding:**
   - When messages arrive in message router for agent
   - MCP server calls `session/prompt` with message content
   - OpenCode processes as coding task and responds

4. **Response Handling:**
   - ACP agent (OpenCode) streams responses back to ACP client (MCP server)
   - MCP server can log responses or forward back to message router if needed

5. **Cleanup:**
   - On container shutdown, ACP session terminates naturally

- No explicit session cleanup needed

**Integration Points with Existing Message Router:**

1. **ContainerManager Changes:**
   - Remove stdin piping from entrypoint.sh
   - Start OpenCode in ACP agent mode
   - Create ACP client connection when container is ready

2. **Message Router Integration:**
   - Hook into existing `message:sent` events for agent messages
   - Instead of notifications, forward messages via ACP `session/prompt`
   - Maintain existing message storage and read capabilities

3. **Agent MCP Server Changes:**
   - Add ACP client functionality alongside existing MCP server
   - Keep existing messaging tools for backward compatibility
   - Add ACP session management per container/agent

4. **No Breaking Changes:**
   - Existing developer MCP interface remains unchanged
   - Message routing storage and retrieval unchanged
   - Only the container communication mechanism changes

## Implementation Plan

### 1. ACP Client Architecture Design

**New Components:**

- `ACPClientManager` - Manages ACP client connections to containers
- `ACPContainerClient` - Individual ACP client for each container
- `ACPMessageForwarder` - Forwards messages from message router to ACP

**Integration Points:**

- `ContainerManager.spawnAgent()` - Create ACP client after container start
- `AgentMcpServer` - Add ACP client management alongside MCP server
- Message router `message:sent` events - Hook for ACP forwarding

**Dependencies:**

- Add `@agentclientprotocol/sdk` to server package dependencies
- Maintain existing MCP and Docker dependencies

### 2. Container Communication Flow

**Current:**

```
Container → printf "get your messages\n" | opencode → MCP connection
```

**New:**

```
Container → opencode --agent-mode=acp → stdio ACP agent
MCP Server → ACP Client → stdio → ACP Agent (OpenCode)
```

**Container Changes:**

- Remove stdin piping from entrypoint.sh
- Add ACP agent mode flag to OpenCode startup
- Maintain workspace mounting and environment variables

### 3. Message Forwarding Strategy

**Event Flow:**

1. Developer/Agent sends message via MCP tools
2. Message stored in message router
3. `message:sent` event fired
4. `ACPMessageForwarder` intercepts events for agent recipients
5. Message forwarded as ACP `session/prompt` to container
6. OpenCode processes as coding task
7. Responses logged or handled as needed

**Message Format Conversion:**

- Message router message → ACP ContentBlock (text)
- Preserve message metadata (from, timestamp, priority)
- Include context in prompt (who sent it, when, etc.)

### 4. ACP TypeScript SDK Integration

**Dependency Management:**

- Add `@agentclientprotocol/sdk` to `packages/server/package.json`
- Version to use: Latest stable version from npm
- No breaking changes to existing dependencies

**Import Strategy:**

```typescript
import { Client, Agent, StdioTransport } from "@agentclientprotocol/sdk";
```

**Type Integration:**

- Use ACP types for session management
- Integrate with existing TypeScript setup
- Maintain type safety with existing MCP types

**Configuration:**

- ACP client will use stdio transport to communicate with containers
- No additional configuration files needed
- Leverage existing container environment setup

### 5. Container Startup and Entrypoint Changes

**Entrypoint Script Modifications (docker/agent/entrypoint.sh):**

**Remove:**

```bash
printf "get your messages\n" | exec "$OPENCODE_BIN" --agent "$AGENT_TYPE"
```

**Replace with:**

```bash
exec "$OPENCODE_BIN" --agent "$AGENT_TYPE" --transport stdio
```

**Additional Changes:**

- Remove dependency on `TASK` environment variable for startup
- Keep `AGENT_CONFIG_BASE64` for OpenCode configuration
- Maintain workspace mounting at `/workspace`
- Keep all existing environment variables

**OpenCode Configuration Updates:**

- Ensure OpenCode supports ACP agent mode with `--transport stdio`
- If flag doesn't exist, coordinate with OpenCode team for implementation
- Fallback: Use existing OpenCode with modified stdin handling

**Container Lifecycle:**

1. Container starts OpenCode in ACP agent mode
2. MCP server connects via ACP client to container's stdio
3. ACP handshake: `initialize` → `session/new`
4. Ready to receive messages via `session/prompt`

### 6. Message Router Event Handling and ACP Forwarding

**Current Event Handling (in AgentMcpServer):**

```typescript
this.messageRouter.on("message:sent", async (event) => {
  const { message } = event;
  // Currently sends notifications via StreamableHttpTransport
  this.transport.notifyMessage(message.to, { ... });
});
```

**New ACP Forwarding:**

```typescript
this.messageRouter.on("message:sent", async (event) => {
  const { message } = event;

  // If recipient is a container agent, forward via ACP
  if (message.to.startsWith("agent-") && this.acpClientManager.hasClient(message.to)) {
    await this.acpClientManager.forwardMessage(message.to, message);
  }

  // Keep existing notification for backward compatibility
  if (this.transport.hasSession(message.to)) {
    this.transport.notifyMessage(message.to, { ... });
  }
});
```

**Message Formatting for ACP:**

- Convert message router `Message` to ACP `ContentBlock[]`
- Include sender context: "Message from {from} at {timestamp}:"
- Preserve priority as annotation or in content
- Handle multiline messages appropriately

**Concurrent Handling:**

- Both ACP and MCP notification systems can coexist
- Agents can use either connection method
- No interference between systems

### 7. Error Handling and Connection Management

**ACP Connection Lifecycle:**

1. **Connection Establishment:**
   - Retry logic for initial ACP `initialize` call
   - Timeout handling (10s for container startup)
   - Graceful degradation if ACP connection fails

2. **Session Management:**
   - Track ACP session state per container
   - Handle session recreation on connection loss
   - Clean up sessions when containers stop

3. **Error Scenarios:**
   - Container fails to start in ACP mode → Log error, container remains non-functional
   - ACP connection drops → Attempt reconnection with exponential backoff
   - OpenCode doesn't support ACP → Log error, container setup needs update
   - Message forwarding fails → Log error, retry with backoff

**Connection Recovery:**

- Implement exponential backoff for reconnection attempts
- Maximum 3 retry attempts before marking container as failed
- Health check: Periodic ACP ping to verify connection

**Monitoring and Logging:**

- Log ACP connection establishment and failures
- Track message forwarding success/failure rates
- Monitor ACP session health and performance
- Use existing McpLogger infrastructure

### 8. Testing Strategy for ACP Integration

**Unit Tests:**

- `ACPClientManager` - Connection management and message forwarding
- `ACPContainerClient` - Individual client operations
- `ACPMessageForwarder` - Message conversion and routing
- Mock ACP agent responses for testing

**Integration Tests:**

- End-to-end message flow: MCP → Message Router → ACP → Container
- Container startup with ACP mode
- Error handling and connection recovery
- Backward compatibility with existing MCP notifications

**Manual Testing:**

- Spawn container with ACP-enabled OpenCode
- Send messages via MCP tools and verify ACP delivery
- Test TUI functionality (no more stdin issues)
- Verify existing developer MCP interface still works

**Test Data:**

- Sample messages with various content types
- Error scenarios (connection drops, invalid responses)
- Performance testing with multiple concurrent agents

**Existing Test Infrastructure:**

- Leverage existing Vitest setup in packages/server
- Use existing Docker test utilities
- Maintain existing MCP server test coverage

### 9. Natural Backward Compatibility

**Why It's Naturally Backward Compatible:**

- Developer MCP interface unchanged (send_message, get_messages, etc.)
- Message router storage and APIs unchanged
- Agent registry and management unchanged
- Only internal container communication changes (stdin → ACP)

**No Special Handling Needed:**

- External interfaces remain identical
- Same message format in message router
- Same developer experience
- Same agent configuration files

---

_This plan is maintained by the LLM. Tool responses provide guidance on which section to focus on and what tasks to work on._
