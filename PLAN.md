# Implementation Plan: Web-Server Package

## 🎯 Goal
Build a web application that visualizes spawned agents with real-time updates (no polling).

## ✅ Completed

### Phase 1: Foundation (TDD)
- ✅ Package setup (@crowd-mcp/web-server)
- ✅ AgentRegistry with Docker sync (3 tests)
- ✅ AgentRegistry with Events (3 more tests, total: 6)
- ✅ Documentation updates (ARCHITECTURE.md, DESIGN.md)

**Test Coverage:**
```
AgentRegistry:
  ✓ syncFromDocker - loads agents from Docker containers
  ✓ syncFromDocker - filters non-agent containers
  ✓ syncFromDocker - handles empty list
  ✓ registerAgent - emits agent:created event
  ✓ updateAgent - emits agent:updated event
  ✓ removeAgent - emits agent:removed event
```

## 🔄 In Progress

### Phase 2: HTTP API (REST Endpoints)

**Iteration 3: REST API (TDD)**

**Files to create:**
- `packages/web-server/src/api/agents.test.ts`
- `packages/web-server/src/api/agents.ts`

**TDD Steps:**
1. 🔴 RED: Write test for `GET /api/agents`
   - Mock AgentRegistry.listAgents()
   - Expect JSON response with agents array

2. 🟢 GREEN: Implement Express router
   - Create router with GET /api/agents endpoint
   - Call registry.listAgents()
   - Return JSON

3. 🔴 RED: Write test for `GET /api/agents/:id`
   - Mock AgentRegistry.getAgent()
   - Test found case (200)
   - Test not found case (404)

4. 🟢 GREEN: Implement GET by ID
   - Add endpoint
   - Handle 404

5. ♻️ REFACTOR: Clean up if needed

**Acceptance Criteria:**
- GET /api/agents returns { agents: Agent[] }
- GET /api/agents/:id returns { agent: Agent } or 404
- Tests use supertest for HTTP testing
- Registry is mocked

### Phase 3: Server-Sent Events (Real-time Updates)

**Iteration 4: SSE Endpoint (TDD)**

**Files to create:**
- `packages/web-server/src/api/events.test.ts`
- `packages/web-server/src/api/events.ts`

**TDD Steps:**
1. 🔴 RED: Write test for SSE connection
   - Test correct headers (text/event-stream)
   - Test event emission when registry emits

2. 🟢 GREEN: Implement SSE endpoint
   - GET /api/events
   - Subscribe to registry events
   - Send SSE format

3. 🔴 RED: Test cleanup on disconnect
   - Verify event listeners are removed

4. 🟢 GREEN: Implement cleanup

5. ♻️ REFACTOR: Clean up

**Acceptance Criteria:**
- GET /api/events streams SSE
- Events: agent:created, agent:updated, agent:removed
- Cleanup on client disconnect
- Data format: JSON stringified Agent

### Phase 4: Integration

**Iteration 5: createHttpServer & Integration**

**Files to create:**
- `packages/web-server/src/index.ts`
- `packages/web-server/src/index.test.ts`

**Steps:**
1. Export createHttpServer(docker, registry) function
2. Mount routers: /api/agents, /api/events
3. Test integration
4. Update packages/server/src/index.ts to use web-server

**Acceptance Criteria:**
- Single function exports HTTP server
- All routes mounted
- Express app returned (not started)
- Integration test with real AgentRegistry

### Phase 5: Update MCP Server Integration

**Files to update:**
- `packages/server/src/index.ts`
- `packages/server/src/mcp-server.ts`

**Steps:**
1. Create AgentRegistry in main()
2. Pass registry to McpServer
3. McpServer.handleSpawnAgent calls registry.registerAgent()
4. Start HTTP server alongside MCP server

**Acceptance Criteria:**
- MCP server and HTTP server run in same process
- spawn_agent registers in AgentRegistry
- registry.syncFromDocker() called on startup
- Tests updated

## 📦 Dependencies to Add

```json
// packages/web-server/package.json
{
  "devDependencies": {
    "supertest": "^7.0.0",
    "@types/supertest": "^6.0.2"
  }
}
```

```json
// packages/server/package.json
{
  "dependencies": {
    "@crowd-mcp/web-server": "workspace:*"
  }
}
```

## 🧪 Testing Strategy

### Unit Tests
- Mock AgentRegistry for API tests
- Mock Docker for AgentRegistry tests
- Mock Express req/res for route tests

### Integration Tests
- Real AgentRegistry + Real Express
- Supertest for HTTP testing
- Test full request/response cycle

### No End-to-End Tests (Yet)
- No Docker required for tests
- No actual containers spawned in tests

## 📋 Definition of Done

### Per Iteration:
- [ ] Tests written FIRST (RED)
- [ ] Implementation passes tests (GREEN)
- [ ] Code refactored if needed
- [ ] All tests passing
- [ ] Committed with clear message
- [ ] Pushed to remote

### Per Phase:
- [ ] All iterations completed
- [ ] Documentation updated if needed
- [ ] Integration working
- [ ] Ready for next phase

## 🎓 TDD Principles to Follow

1. **RED first**: Always write failing test before code
2. **Minimal GREEN**: Write just enough code to pass
3. **REFACTOR**: Improve only when tests are green
4. **One test at a time**: Focus, don't batch
5. **Mock externals**: Docker, Express req/res, etc.
6. **Behavior, not types**: Test what code DOES, not what it IS

## 📊 Current State

```
packages/
├── shared/        ✅ Types
├── server/        ✅ MCP Server + CLI
└── web-server/    🔄 AgentRegistry (6 tests ✅)
                   ⏳ HTTP API (pending)
                   ⏳ SSE Events (pending)
                   ⏳ Integration (pending)
```

## 🚀 Start Next Session With

```bash
cd /home/user/crowd-mcp
git status
git log --oneline -5

# Start Iteration 3: HTTP API
# Read this file: PLAN.md
# Create: packages/web-server/src/api/agents.test.ts
```

## 📝 Notes

- Docker as source of truth (containers persist)
- In-memory registry for performance
- Event-driven for real-time (no polling!)
- Separate package for future separation
- Integrated process for MVP
- TDD all the way!

---

Last updated: 2025-10-25
Branch: claude/implement-mvp-011CUU9Bhs9rV2SB3S1vw2SS
Tokens used: ~127k
