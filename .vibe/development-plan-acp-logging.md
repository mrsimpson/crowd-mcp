# ACP Verbose Logging System

## Problem

Agent interaction with ACP is failing. Need detailed logging to debug:

- ACP communication between host and container
- Local MCP server operations
- Internal MCP message routing

## Solution

Implement verbose logging system with separate log files for each component.

## Phase Entrance Criteria

### Plan Phase

**Enter when:**

- [x] Problem identified (ACP interaction failures)
- [x] WIP commit made
- [x] Logging requirements defined

### Code Phase

**Enter when:**

- [ ] Logging architecture designed
- [ ] File paths and formats specified
- [ ] Implementation approach confirmed

### Commit Phase

**Enter when:**

- [ ] All logging components implemented
- [ ] Log files being written correctly
- [ ] ACP interaction debugging enabled

## Explore

### Requirements Analysis

- [x] Identify ACP communication failure points
- [x] Define log file structure and locations
- [x] Specify log levels and formats
- [ ] Plan log rotation and cleanup

### Technical Design

- [x] Design FileLogger utility class
- [x] Plan ACP client logging integration
- [ ] Design MCP server logging hooks
- [ ] Plan container log forwarding

## Plan

### Log File Structure

```
.crowd/logs/
├── acp-{agentId}-{timestamp}.log     # ACP protocol communication
├── mcp-local-{timestamp}.log         # Local MCP server operations
├── mcp-internal-{timestamp}.log      # Internal message routing
└── container-{agentId}-{timestamp}.log # Container stdout/stderr
```

### Implementation Tasks

- [x] Create FileLogger utility class
- [x] Add ACP client logging to ACPContainerClient
- [ ] Add verbose logging to AgentMcpServer
- [ ] Add detailed logging to MessageRouter
- [ ] Forward container logs to host filesystem
- [ ] Add log file cleanup mechanism

### Log Content Specification

- [x] ACP logs: session creation, message exchange, errors
- [ ] MCP local logs: server startup, tool calls, responses
- [ ] MCP internal logs: message routing, participant management
- [ ] Container logs: OpenCode output, plugin installations

## Code

### Core Components

- [x] `src/logging/file-logger.ts` - File logging utility
- [x] `src/acp/acp-logger.ts` - ACP-specific logging
- [ ] `src/mcp/mcp-logger.ts` - Enhanced MCP logging
- [ ] `src/core/message-logger.ts` - Message routing logging

### Integration Points

- [x] Update ACPContainerClient with ACP logging
- [ ] Update AgentMcpServer with verbose MCP logging
- [ ] Update MessageRouter with detailed routing logs
- [ ] Update ContainerManager with log forwarding

## Commit

### Verification

- [ ] Log files created in .crowd/logs/
- [ ] ACP communication logged with timestamps
- [ ] MCP operations logged with details
- [ ] Container logs forwarded to host
- [ ] Log rotation working correctly

### Documentation

- [ ] Update README with logging information
- [ ] Document log file formats
- [ ] Add troubleshooting guide

## Key Decisions

- **Log Location**: Use `.crowd/logs/` directory for centralized logging
- **File Naming**: Include component, agent ID, and timestamp for clarity
- **Log Format**: JSON for structured data, plain text for readability
- **Log Levels**: DEBUG, INFO, WARN, ERROR with configurable verbosity

## Notes

- Focus on ACP interaction debugging first
- Ensure logs don't impact performance significantly
- Plan for log file size management
- Consider log streaming for real-time debugging
