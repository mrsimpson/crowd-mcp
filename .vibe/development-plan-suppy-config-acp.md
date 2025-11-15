# ACP-Compliant Configuration Implementation

## Overview

Implement ACP (Agent Communication Protocol) compliant configuration for crowd-mcp agents. Move from file-based MCP configuration to dynamic ACP session creation with MCP servers passed at runtime.

## Explore ✅ (Final - Correct Understanding)

### Current State Analysis - FINAL

- **YAML Agent Definitions**: Already working (`.crowd/agents/*.yaml`)
- **Config Generator**: Already converts YAML to OpenCode config files
- **ACP Infrastructure**: Already implemented and working
- **Missing Link**: Config generator outputs file format, need ACP format

### User's Clarification ✅

- **Keep YAML approach**: Agent definitions in `.crowd/agents/*.yaml`
- **Modify config generator**: Output ACP-compatible MCP server list instead of config files
- **Always include messaging**: Messaging MCP server added implicitly
- **Fallback**: If no agent YAML, just supply messaging MCP server

### Current Flow

```
YAML Agent Definition → ConfigGenerator → OpenCode Config File → Container
```

### Target Flow

```
YAML Agent Definition → ConfigGenerator → ACP MCP Server List → ACP Session Creation
```

### What Needs to Change (Minimal)

1. **ConfigGenerator**: Add method to output ACP MCP server format
2. **ContainerManager**: Use ACP MCP servers instead of config files
3. **ACPContainerClient**: Accept and pass MCP servers to session creation

## Plan ✅ (Final - Simplified)

### Phase Entrance Criteria:

- [x] Current ACP implementation in OpenCode is fully understood
- [x] User's approach clarified: modify config generator for ACP output
- [x] YAML → ACP MCP server conversion approach defined
- [x] Messaging MCP server implicit inclusion understood

### Implementation Strategy (Simplified)

#### 1. **Add ACP Output to ConfigGenerator**

- Add `generateAcpMcpServers()` method to `ConfigGenerator`
- Convert YAML agent definitions to ACP MCP server format
- Always include messaging MCP server implicitly

#### 2. **Update ContainerManager**

- Use `generateAcpMcpServers()` instead of `generateJson()`
- Pass ACP MCP servers to `ACPContainerClient`
- Remove config file generation and `AGENT_CONFIG_BASE64`

#### 3. **Update ACPContainerClient**

- Accept MCP servers parameter in constructor or `initialize()`
- Pass MCP servers to `session/new` instead of empty array
- Handle fallback case (messaging server only)

#### ACP MCP Server Format

```typescript
// Target ACP format
[
  {
    name: "messaging",
    type: "http",
    url: "http://host.docker.internal:3100/mcp",
    headers: [],
  },
  {
    name: "custom-server",
    command: "python",
    args: ["-m", "server"],
    env: [{ name: "API_KEY", value: "..." }],
  },
];
```

## Code

### Phase Entrance Criteria:

- [x] Implementation plan is complete and approved
- [x] ACP MCP server format conversion approach defined
- [x] ConfigGenerator modification strategy clear
- [x] ContainerManager integration approach planned

### Implementation Tasks (Simplified)

#### 1. **Add ACP Output to ConfigGenerator** (`src/agent-config/config-generator.ts`)

- [x] Add `generateAcpMcpServers(agentName, workspaceDir, context)` method
- [x] Convert YAML MCP servers to ACP format
- [x] Always include messaging MCP server implicitly
- [x] Handle fallback case (no agent YAML = messaging server only)

#### 2. **Create ACP MCP Converter** (`src/agent-config/acp-mcp-converter.ts`)

- [x] Convert stdio servers: `{type: "stdio", command, args, env}` → `{name, command, args, env: [{name, value}]}`
- [x] Convert HTTP servers: `{type: "http", url, headers}` → `{name, type: "http", url, headers: [{name, value}]}`
- [x] Add messaging server factory method

#### 3. **Update ContainerManager** (`src/docker/container-manager.ts`)

- [x] Replace `configGenerator.generateJson()` with `generateAcpMcpServers()`
- [x] Pass ACP MCP servers to `ACPContainerClient`
- [x] Remove `AGENT_CONFIG_BASE64` environment variable
- [ ] Keep minimal base config if needed for providers

#### 4. **Update ACPContainerClient** (`src/acp/acp-container-client.ts`)

- [x] Accept `mcpServers` parameter in constructor or `initialize()`
- [x] Replace `mcpServers: []` with actual servers in `session/new`
- [x] Handle empty case gracefully (messaging server only)

#### 5. **Testing & Validation**

- [ ] ~~Test with existing agent templates (architect, coder, reviewer)~~ - Tests failing due to interface changes
- [ ] ~~Test fallback case (no agent YAML)~~ - Tests failing due to interface changes
- [x] Verify messaging MCP server always included
- [x] Ensure ACP session creation works with MCP servers
- [ ] **Create new tests for ACP approach** - Replace old config file tests with ACP MCP server tests

#### 6. **Create New ACP Tests** (`src/agent-config/acp-*.test.ts`)

- [x] Test `AcpMcpConverter.convertToAcpFormat()` with stdio and HTTP servers
- [x] Test `ConfigGenerator.generateAcpMcpServers()` with agent definitions
- [x] Test messaging server always included implicitly
- [x] Test fallback case (no agent YAML = messaging only)
- [x] Test environment variable resolution in ACP format
- [x] Update ContainerManager tests for ACP MCP server usage

#### 7. **Clean Up Obsolete Code**

- [ ] Remove old config file generation tests
- [ ] Remove obsolete OpenCodeAdapter config file generation methods
- [ ] Remove tests checking for non-existence of old features
- [ ] Clean up any remaining config file references

## Commit

### Phase Entrance Criteria:

- [ ] Core ACP integration is implemented and working
- [ ] Container startup uses ACP mode successfully
- [ ] MCP servers are passed via ACP session creation
- [ ] Existing functionality is preserved and tested

### Finalization Tasks

[To be filled during implementation phase]

## Success Criteria

- [ ] Agents start with OpenCode in ACP mode
- [ ] MCP servers are configured via ACP session creation
- [ ] Messaging MCP server is properly injected
- [ ] Base OpenCode config contains only provider settings
- [ ] All existing agent templates work with new approach
