import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, ChildProcess } from "child_process";

/**
 * End-to-End Integration Test for Streamable HTTP Transport
 */
describe("Streamable HTTP E2E", () => {
  let serverProcess: ChildProcess;
  const TEST_AGENT_MCP_PORT = 3101;

  beforeAll(async () => {
    console.log("🚀 Starting MCP server...");

    serverProcess = spawn("node", ["dist/index.js"], {
      cwd: "/Users/oliverjaegle/projects/privat/mcp-server/crowd/packages/server",
      env: {
        ...process.env,
        HTTP_PORT: "3001",
        AGENT_MCP_PORT: TEST_AGENT_MCP_PORT.toString(),
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    serverProcess.stdout?.on("data", (data) => {
      console.log(`[SERVER] ${data.toString().trim()}`);
    });

    serverProcess.stderr?.on("data", (data) => {
      console.error(`[SERVER ERROR] ${data.toString().trim()}`);
    });

    // Wait for server to start
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Health check
    const healthResponse = await fetch(
      `http://localhost:${TEST_AGENT_MCP_PORT}/health`,
    );
    if (!healthResponse.ok) {
      throw new Error(`Health check failed: ${healthResponse.status}`);
    }

    console.log("✅ Server started successfully");
  }, 30000);

  afterAll(async () => {
    if (serverProcess && !serverProcess.killed) {
      serverProcess.kill("SIGTERM");
      await new Promise((resolve) => setTimeout(resolve, 1000));
      if (!serverProcess.killed) {
        serverProcess.kill("SIGKILL");
      }
    }
  });

  it("should handle MCP initialize via streamable HTTP", async () => {
    const response = await fetch(
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

    expect(response.ok).toBe(true);

    const sessionId = response.headers.get("Mcp-Session-Id");
    expect(sessionId).toBeDefined();

    const data = await response.json();
    expect(data.jsonrpc).toBe("2.0");
    expect(data.result.serverInfo.name).toBe("crowd-mcp-agent-interface");

    console.log("✅ Initialize successful, session:", sessionId);
  }, 10000);

  it("should list tools via streamable HTTP", async () => {
    // Initialize first
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
            clientInfo: { name: "test", version: "1.0" },
          },
        }),
      },
    );

    const sessionId = initResponse.headers.get("Mcp-Session-Id");

    // List tools
    const response = await fetch(
      `http://localhost:${TEST_AGENT_MCP_PORT}/mcp`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "Mcp-Session-Id": sessionId!,
        },
        body: JSON.stringify({ jsonrpc: "2.0", method: "tools/list", id: 2 }),
      },
    );

    expect(response.ok).toBe(true);

    const data = await response.json();
    expect(data.result.tools).toBeDefined();

    const toolNames = data.result.tools.map((t: any) => t.name);
    expect(toolNames).toContain("send_message");
    expect(toolNames).toContain("get_my_messages");

    console.log("✅ Tools listed:", toolNames.join(", "));
  }, 10000);

  it("should establish SSE stream", async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 5000);

    const response = await fetch(
      `http://localhost:${TEST_AGENT_MCP_PORT}/mcp`,
      {
        method: "GET",
        headers: { Accept: "text/event-stream" },
        signal: controller.signal,
      },
    ).catch(() => null);

    if (response) {
      expect(response.ok).toBe(true);
      expect(response.headers.get("content-type")).toBe("text/event-stream");
      const sessionId = response.headers.get("Mcp-Session-Id");
      expect(sessionId).toBeDefined();
      console.log("✅ SSE stream established, session:", sessionId);
    }
  }, 10000);
});
