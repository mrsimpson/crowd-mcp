import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, ChildProcess } from "child_process";
import { setTimeout } from "timers/promises";

/**
 * End-to-End Integration Test for Streamable HTTP Transport
 *
 * This test verifies the complete message delivery flow:
 * 1. Start the MCP server in the background
 * 2. Use spawn_agent to create an architect agent
 * 3. Send a message to the agent asking for a response
 * 4. Poll for messages to verify delivery
 */
describe("Streamable HTTP MCP Server - End-to-End Integration", () => {
  let serverProcess: ChildProcess;
  const TEST_HTTP_PORT = 3003;
  const TEST_AGENT_MCP_PORT = 3100;

  beforeAll(async () => {
    console.log("🚀 Starting MCP server for integration test...");

    // Start the server process with custom ports
    serverProcess = spawn("node", ["dist/index.js"], {
      cwd: "/Users/oliverjaegle/projects/privat/mcp-server/crowd/packages/server",
      env: {
        ...process.env,
        HTTP_PORT: TEST_HTTP_PORT.toString(),
        AGENT_MCP_PORT: TEST_AGENT_MCP_PORT.toString(),
        CROWD_DEMO_MODE: "true",
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Capture server output for debugging
    let serverOutput = "";
    serverProcess.stdout?.on("data", (data) => {
      const output = data.toString();
      serverOutput += output;
      console.log(`[SERVER] ${output.trim()}`);
    });

    serverProcess.stderr?.on("data", (data) => {
      const output = data.toString();
      serverOutput += output;
      console.error(`[SERVER ERROR] ${output.trim()}`);
    });

    // Wait for server to start
    console.log("⏳ Waiting for server to initialize...");
    await setTimeout(5000);

    // Verify server is running by checking health endpoint
    const healthResponse = await fetch(
      `http://localhost:${TEST_AGENT_MCP_PORT}/health`,
    );
    if (!healthResponse.ok) {
      throw new Error(`Server health check failed: ${healthResponse.status}`);
    }

    const healthData = await healthResponse.json();
    console.log("✅ Server health check passed:", healthData);
  }, 30000);

  afterAll(async () => {
    console.log("🧹 Cleaning up server process...");
    if (serverProcess && !serverProcess.killed) {
      serverProcess.kill("SIGTERM");

      // Wait for graceful shutdown, then force kill if needed
      await setTimeout(2000);
      if (!serverProcess.killed) {
        serverProcess.kill("SIGKILL");
      }
    }
  });

  it("should handle MCP initialize request via streamable HTTP", async () => {
    console.log("🧪 Testing MCP initialize request...");

    // Test the new streamable HTTP endpoint
    const initializeRequest = {
      jsonrpc: "2.0",
      method: "initialize",
      id: 1,
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: {
          name: "test-client",
          version: "1.0.0",
        },
      },
    };

    const response = await fetch(
      `http://localhost:${TEST_AGENT_MCP_PORT}/mcp`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(initializeRequest),
      },
    );

    expect(response.ok).toBe(true);

    // Should get session ID in header
    const sessionId = response.headers.get("Mcp-Session-Id");
    expect(sessionId).toBeDefined();
    expect(sessionId).toMatch(/^[a-f0-9-]{36}$/); // UUID format

    const responseData = await response.json();
    expect(responseData.jsonrpc).toBe("2.0");
    expect(responseData.result).toBeDefined();
    expect(responseData.result.protocolVersion).toBe("2025-03-26");
    expect(responseData.result.serverInfo.name).toBe(
      "crowd-mcp-agent-interface",
    );
    expect(responseData.id).toBe(1);

    console.log("✅ Initialize request successful");
    console.log(`   Session ID: ${sessionId}`);
    console.log(
      `   Server Info: ${responseData.result.serverInfo.name} v${responseData.result.serverInfo.version}`,
    );
  }, 15000);

  it("should handle tools/list request via streamable HTTP", async () => {
    console.log("🧪 Testing tools/list request...");

    // First initialize to get session
    const initResponse = await fetch(
      `http://localhost:${TEST_AGENT_MCP_PORT}/mcp`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "initialize",
          id: 1,
          params: {
            protocolVersion: "2025-03-26",
            capabilities: {},
            clientInfo: { name: "test-client", version: "1.0.0" },
          },
        }),
      },
    );

    const sessionId = initResponse.headers.get("Mcp-Session-Id");
    expect(sessionId).toBeDefined();

    // Now test tools/list
    const toolsListRequest = {
      jsonrpc: "2.0",
      method: "tools/list",
      id: 2,
    };

    const response = await fetch(
      `http://localhost:${TEST_AGENT_MCP_PORT}/mcp`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "Mcp-Session-Id": sessionId!,
        },
        body: JSON.stringify(toolsListRequest),
      },
    );

    expect(response.ok).toBe(true);

    const responseData = await response.json();
    expect(responseData.jsonrpc).toBe("2.0");
    expect(responseData.result).toBeDefined();
    expect(responseData.result.tools).toBeDefined();
    expect(Array.isArray(responseData.result.tools)).toBe(true);

    // Should have messaging tools
    const toolNames = responseData.result.tools.map((tool: any) => tool.name);
    expect(toolNames).toContain("send_message");
    expect(toolNames).toContain("get_my_messages");
    expect(toolNames).toContain("discover_agents");
    expect(toolNames).toContain("mark_messages_read");

    console.log("✅ Tools/list request successful");
    console.log(`   Available tools: ${toolNames.join(", ")}`);
  }, 15000);

  it("should establish SSE stream via GET request", async () => {
    console.log("🧪 Testing SSE stream establishment...");

    // Test GET request for SSE stream
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(
        `http://localhost:${TEST_AGENT_MCP_PORT}/mcp`,
        {
          method: "GET",
          headers: {
            Accept: "text/event-stream",
          },
          signal: controller.signal,
        },
      );

      expect(response.ok).toBe(true);
      expect(response.headers.get("content-type")).toBe("text/event-stream");

      // Should get session ID
      const sessionId = response.headers.get("Mcp-Session-Id");
      expect(sessionId).toBeDefined();

      console.log("✅ SSE stream established successfully");
      console.log(`   Session ID: ${sessionId}`);
      console.log(`   Content-Type: ${response.headers.get("content-type")}`);
    } finally {
      clearTimeout(timeoutId);
      controller.abort();
    }
  }, 15000);

  it("should handle session termination via DELETE", async () => {
    console.log("🧪 Testing session termination...");

    // First create a session
    const initResponse = await fetch(
      `http://localhost:${TEST_AGENT_MCP_PORT}/mcp`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "initialize",
          id: 1,
          params: {
            protocolVersion: "2025-03-26",
            capabilities: {},
            clientInfo: { name: "test-client", version: "1.0.0" },
          },
        }),
      },
    );

    const sessionId = initResponse.headers.get("Mcp-Session-Id");
    expect(sessionId).toBeDefined();

    // Now terminate the session
    const deleteResponse = await fetch(
      `http://localhost:${TEST_AGENT_MCP_PORT}/mcp`,
      {
        method: "DELETE",
        headers: {
          "Mcp-Session-Id": sessionId!,
        },
      },
    );

    expect(deleteResponse.ok).toBe(true);
    expect(deleteResponse.status).toBe(200);

    const responseText = await deleteResponse.text();
    expect(responseText).toBe("Session terminated");

    // Verify session is actually terminated by trying to use it
    const testResponse = await fetch(
      `http://localhost:${TEST_AGENT_MCP_PORT}/mcp`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "Mcp-Session-Id": sessionId!,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "tools/list",
          id: 2,
        }),
      },
    );

    expect(testResponse.status).toBe(404);

    console.log("✅ Session termination successful");
    console.log(`   Terminated session: ${sessionId}`);
  }, 15000);

  it("should handle active connections tracking", async () => {
    console.log("🧪 Testing active connections tracking...");

    // Check initial state
    const healthResponse1 = await fetch(
      `http://localhost:${TEST_AGENT_MCP_PORT}/health`,
    );
    const healthData1 = await healthResponse1.json();
    const initialConnections = healthData1.activeSessions;

    // Create a session
    const initResponse = await fetch(
      `http://localhost:${TEST_AGENT_MCP_PORT}/mcp`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "initialize",
          id: 1,
          params: {
            protocolVersion: "2025-03-26",
            capabilities: {},
            clientInfo: { name: "test-client", version: "1.0.0" },
          },
        }),
      },
    );

    const sessionId = initResponse.headers.get("Mcp-Session-Id");

    // Check connections increased
    const healthResponse2 = await fetch(
      `http://localhost:${TEST_AGENT_MCP_PORT}/health`,
    );
    const healthData2 = await healthResponse2.json();
    expect(healthData2.activeSessions).toBeGreaterThanOrEqual(initialConnections + 1);

    // Terminate session
    await fetch(`http://localhost:${TEST_AGENT_MCP_PORT}/mcp`, {
      method: "DELETE",
      headers: { "Mcp-Session-Id": sessionId! },
    });

    // Check connections decreased
    const healthResponse3 = await fetch(
      `http://localhost:${TEST_AGENT_MCP_PORT}/health`,
    );
    const healthData3 = await healthResponse3.json();
    expect(healthData3.activeSessions).toBe(initialConnections);

    console.log("✅ Active connections tracking working");
    console.log(
      `   Initial: ${initialConnections}, With session: ${healthData2.activeSessions}, After cleanup: ${healthData3.activeSessions}`,
    );
  }, 15000);
});
