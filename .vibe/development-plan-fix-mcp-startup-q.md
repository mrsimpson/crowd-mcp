# Development Plan: crowd (fix-mcp-startup-q branch)

*Generated on 2025-11-15 by Vibe Feature MCP*
*Workflow: [bugfix](https://mrsimpson.github.io/responsible-vibe-mcp/workflows/bugfix)*

## Goal
Fix crowd MCP server issue where agent spawning fails with Amazon Q client due to JSON parsing errors, while working correctly with other MCP clients.

## Reproduce
### Tasks
- [x] Reproduce the error with Amazon Q client
- [x] Test with other MCP clients to confirm they work
- [x] Capture detailed logs and error messages
- [x] Identify the specific JSON parsing failure point
- [x] Located the problematic log message in ContainerManager

### Completed
- [x] Created development plan file
- [x] Initial error logs provided by user
- [x] Found root cause: Line 58 in container-manager.ts contains emoji in log message
- [x] Confirmed the log message "📋 Generated X MCP servers for agent Y" matches the error

## Analyze
### Phase Entrance Criteria:
- [x] Bug has been reliably reproduced with Amazon Q
- [x] Error messages and logs have been captured
- [x] Behavior difference between Amazon Q and other clients is documented

### Tasks
- [x] Remove emoji from the problematic log message in ContainerManager
- [x] Remove emojis from ACP container client console.log statements
- [x] Verify no other emojis in production code paths
- [x] Build the project to ensure no compilation errors
- [x] Test the fix with Amazon Q
- [x] Implement console override fix (working solution)
- [ ] Replace console statements file by file with proper logging:
  - [x] packages/server/src/acp/acp-client-manager.ts
  - [x] packages/server/src/acp/acp-container-client.ts
  - [x] packages/server/src/agent-config/agent-definition-loader.ts
  - [x] packages/server/src/agent-config/config-generator.ts
  - [x] packages/server/src/core/message-router-jsonl.ts
  - [x] packages/server/src/docker/container-manager.ts
  - [x] packages/server/src/index.ts
  - [x] packages/server/src/logging/file-logger.ts
  - [x] packages/server/src/mcp/agent-mcp-server.ts
  - [x] packages/server/src/mcp/mcp-logger.ts

### Completed
- [x] Fixed emoji characters in acp-container-client.ts (🔌, 📋 removed from console.log statements)
- [x] Confirmed container-manager.ts was already fixed (📋 emoji already removed)
- [x] Project builds successfully without compilation errors
- [x] Console override fix implemented and working with Amazon Q

## Fix
### Phase Entrance Criteria:
- [ ] Root cause of JSON parsing error has been identified
- [ ] Specific differences in Amazon Q's MCP message handling are understood
- [ ] Fix approach has been determined and documented

### Tasks
- [ ] *To be added when this phase becomes active*

### Completed
*None yet*

## Verify
### Phase Entrance Criteria:
- [ ] Fix has been implemented
- [ ] Code changes address the identified root cause
- [ ] Fix is ready for testing

### Tasks
- [ ] *To be added when this phase becomes active*

### Completed
*None yet*

## Finalize
### Phase Entrance Criteria:
- [ ] Fix has been verified to work with Amazon Q
- [ ] No regressions with other MCP clients
- [ ] All tests pass

### Tasks
- [ ] *To be added when this phase becomes active*

### Completed
*None yet*

## Key Decisions
- **MINIMAL FIX IMPLEMENTED**: Removed emoji characters from console.log and logger.info statements that Amazon Q was interpreting as MCP responses
- Fix addresses root cause without affecting functionality
- All changes are in logging output only - no business logic modified

## Notes
**Initial Error Analysis:**
- Error: `Failed to parse message decode: 📋 Generated 1 MCP servers for agent agent-1763145705459 | Error: expected value at line 1 column 1`
- The emoji and text suggest the issue might be in how crowd-mcp formats its response messages
- Amazon Q's MCP parser expects pure JSON but may be receiving formatted text with emojis
- Other clients may be more tolerant of non-standard JSON formatting

**Root Cause Analysis Complete:**
- ContainerManager.spawnAgent() method logs: `this.logger.info(\`📋 Generated \${acpResult.mcpServers.length} MCP servers for agent \${config.agentId}\`);`
- This log output is being sent to stdout/stderr and Amazon Q is parsing it as MCP response
- Other MCP clients likely ignore or handle non-JSON output more gracefully
- The emoji character is causing the JSON parser to fail at "line 1 column 1"

**Technical Analysis:**
- StderrLogger is designed to use stderr to avoid interfering with MCP JSON-RPC on stdout
- However, Amazon Q appears to be reading both stdout AND stderr as part of the MCP response stream
- Other clients (Claude Desktop, etc.) likely only read stdout for MCP responses
- The specific problematic line is line 58 in `/packages/server/src/docker/container-manager.ts`
- The emoji `📋` at the start of the log message is what triggers the JSON parsing error

**Fix Approach:**
1. Remove the emoji from the log message to make it valid text
2. Consider if the log level should be reduced (INFO -> DEBUG) to minimize output
3. Test with Amazon Q to ensure the fix works
4. Verify no regression with other MCP clients

---
*This plan is maintained by the LLM. Tool responses provide guidance on which section to focus on and what tasks to work on.*
