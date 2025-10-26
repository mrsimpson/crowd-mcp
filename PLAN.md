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
AgentRegistry (6 tests):
  ✓ syncFromDocker - loads agents from Docker containers
  ✓ syncFromDocker - filters non-agent containers
  ✓ syncFromDocker - handles empty list
  ✓ registerAgent - emits agent:created event
  ✓ updateAgent - emits agent:updated event
  ✓ removeAgent - emits agent:removed event
```

### Phase 2: HTTP API (REST Endpoints)

- ✅ Iteration 3: REST API (TDD)
  - Created `packages/web-server/src/api/agents.test.ts` (4 tests)
  - Created `packages/web-server/src/api/agents.ts`
  - GET /api/agents returns { agents: Agent[] }
  - GET /api/agents/:id returns { agent: Agent } or 404

**Test Coverage:**
```
Agents API (4 tests):
  ✓ GET /api/agents - returns list of agents
  ✓ GET /api/agents/:id - returns agent when found
  ✓ GET /api/agents/:id - returns 404 when not found
```

### Phase 3: Server-Sent Events (Real-time Updates)

- ✅ Iteration 4: SSE Endpoint (TDD)
  - Created `packages/web-server/src/api/events.test.ts` (4 tests)
  - Created `packages/web-server/src/api/events.ts`
  - GET /api/events streams SSE
  - Events: agent:created, agent:updated, agent:removed
  - Cleanup on client disconnect

**Test Coverage:**
```
Events API (4 tests):
  ✓ Sets SSE headers correctly
  ✓ Registers event listeners on AgentRegistry
  ✓ Sends initial agents list as init event
  ✓ Removes event listeners when client disconnects
```

### Phase 4: Integration

- ✅ Iteration 5: createHttpServer & Integration
  - Created `packages/web-server/src/server.ts` with createHttpServer()
  - Created `packages/web-server/src/server.test.ts` (4 tests)
  - Created `packages/web-server/src/index.ts` (exports)
  - All routes mounted: /api/agents, /api/events, static files
  - Syncs from Docker on startup

**Test Coverage:**
```
HTTP Server Integration (4 tests):
  ✓ Syncs from Docker on startup
  ✓ Starts listening on specified port
  ✓ Mounts agents API at /api/agents
  ✓ Mounts events API at /api/events
```

### Phase 5: MCP Server Integration

- ✅ Update MCP Server to use AgentRegistry
  - Updated `packages/server/src/mcp-server.ts` to accept AgentRegistry
  - Updated `packages/server/src/mcp-server.test.ts` (added 1 test)
  - Updated `packages/server/src/index.ts` to create registry and start HTTP server
  - spawn_agent registers agents in AgentRegistry
  - HTTP server runs on port 3000 (configurable via HTTP_PORT env)

**Test Coverage:**
```
MCP Server (5 tests):
  ✓ Calls ContainerManager.spawnAgent with correct config
  ✓ Throws error if task is empty
  ✓ Propagates errors from ContainerManager
  ✓ Registers agent with AgentRegistry after spawning
```

### Phase 6: Web Frontend

- ✅ Iteration 7: Web UI
  - Created `packages/web-server/public/index.html`
  - Real-time dashboard using SSE
  - Dark theme UI with agent cards
  - Displays agent ID, task, container ID
  - Shows empty state when no agents
  - Connection status indicator
  - Automatic updates on agent:created/updated/removed events

## 📦 Dependencies Added

✅ All dependencies added:
- `supertest` and `@types/supertest` in web-server
- `@crowd-mcp/web-server` in server package
- `express` and `@types/express` in web-server

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
├── shared/        ✅ Types (Agent interface)
├── server/        ✅ MCP Server + CLI + HTTP integration
│                  ✅ 5 tests passing
└── web-server/    🔄 Web application (read-only visualization)
                   ✅ AgentRegistry (6 tests)
                   ✅ HTTP API - Read endpoints (4 tests)
                   ✅ SSE Events (4 tests)
                   ✅ Integration (4 tests)
                   ✅ Web UI - Visualization only (HTML/CSS/JS)
                   ⏳ Control API - Stop, logs (pending)
                   ⏳ Web UI - Interactive controls (pending)
```

**Total: 23 tests passing**

## ⏳ Remaining: Web Interface Controls

### Phase 7: Agent Control API (TDD)

**Goal:** Enable operators to control agents via HTTP API

**Iteration 8: Stop Agent Endpoint**
- 🔴 RED: Write tests for DELETE /api/agents/:id
  - Test successful stop (agent exists)
  - Test 404 (agent not found)
  - Test error propagation from Docker
- 🟢 GREEN: Implement endpoint
  - Call Docker API to stop container
  - Remove from AgentRegistry
  - Return success response
- ♻️ REFACTOR: Clean up

**Iteration 9: Agent Logs Endpoint**
- 🔴 RED: Write tests for GET /api/agents/:id/logs
  - Test successful log retrieval
  - Test 404 (agent not found)
  - Test with tail parameter
- 🟢 GREEN: Implement endpoint
  - Call Docker logs API
  - Stream or return recent logs
- ♻️ REFACTOR: Clean up

### Phase 8: Interactive Web UI (TDD)

**Goal:** Add operator controls to web dashboard

**Iteration 10: Stop Button**
- Update agent cards with stop button
- Wire up DELETE /api/agents/:id API call
- Show confirmation dialog
- Handle errors gracefully
- Update UI on agent:removed event

**Iteration 11: Logs Viewer**
- Add "View Logs" button to agent cards
- Create modal/panel for log display
- Call GET /api/agents/:id/logs
- Auto-scroll to latest logs
- Add refresh button

## 🎯 Definition of Done for Web Interface

**Must Have:**
- ✅ Real-time agent list (DONE)
- ⏳ Stop agent from UI
- ⏳ View agent logs from UI
- ⏳ Error handling and user feedback
- ⏳ All features tested with TDD

**Nice to Have (Future):**
- WebSocket attach for interactive sessions
- Resource usage graphs
- Agent status indicators (running/idle/error)
- Filter/search agents

### How to Run

1. Build the project:
   ```bash
   pnpm build
   ```

2. Start the MCP server (runs both MCP and HTTP server):
   ```bash
   pnpm --filter crowd-mcp start
   # or
   npx crowd-mcp
   ```

3. Open the web UI:
   ```
   http://localhost:3000
   ```

4. Use spawn_agent tool via MCP to create agents - they'll appear in real-time on the dashboard!

## 📝 Notes

- Docker as source of truth (containers persist)
- In-memory registry for performance
- Event-driven for real-time (no polling!)
- Separate package for future separation
- Integrated process for MVP
- TDD all the way!

---

**Status:** 🔄 IN PROGRESS - Visualization complete, controls pending
**Last updated:** 2025-10-26
**Branch:** claude/design-mcp-server-011CUU9Bhs9rV2SB3S1vw2SS
**Total tests:** 23 passing
**TDD methodology:** Followed throughout (RED → GREEN → REFACTOR)

**Next Steps:**
1. Implement DELETE /api/agents/:id (stop agent)
2. Implement GET /api/agents/:id/logs (view logs)
3. Add interactive controls to web UI
4. Update PRD with web interface requirements
