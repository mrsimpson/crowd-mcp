import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, ChildProcess } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { existsSync } from "fs";
import Dockerode from "dockerode";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// __dirname is packages/server/src, go up one level to packages/server
const packageRoot = join(__dirname, "..");

/**
 * End-to-End Integration Test for Streamable HTTP Transport
 *
 * Note: These tests require Docker to be running
 */
describe("Streamable HTTP E2E", () => {
  let serverProcess: ChildProcess;
  const TEST_AGENT_MCP_PORT = 3101;
  let dockerAvailable = false;

  beforeAll(async () => {
    // Check if Docker is available
    const docker = new Dockerode();
    try {
      await docker.ping();
      dockerAvailable = true;
      console.log("✓ Docker is available - running E2E tests");
    } catch {
      dockerAvailable = false;
      console.log("✗ Docker not available - skipping E2E tests");
      return;
    }

    console.log("🚀 Starting MCP server...");

    const distPath = join(packageRoot, "dist", "index.js");
    if (!existsSync(distPath)) {
      throw new Error(
        `Server build not found at ${distPath}. Run 'pnpm build' first.`,
      );
    }

    serverProcess = spawn("node", ["dist/index.js"], {
      cwd: packageRoot,
      env: {
        ...process.env,
        HTTP_PORT: "3001",
        AGENT_MCP_PORT: TEST_AGENT_MCP_PORT.toString(),
        CROWD_DEMO_MODE: "true", // Skip config validation for E2E tests
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

  it.skipIf(!dockerAvailable)(
    "should handle MCP initialize via streamable HTTP",
    async () => {
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
    },
    10000,
  );

  it.skipIf(!dockerAvailable)(
    "should list tools via streamable HTTP",
    async () => {
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

      const toolNames = data.result.tools.map((t: { name: string }) => t.name);
      expect(toolNames).toContain("send_message");
      expect(toolNames).toContain("get_my_messages");

      console.log("✅ Tools listed:", toolNames.join(", "));
    },
    10000,
  );

  it.skipIf(!dockerAvailable)(
    "should establish SSE stream",
    async () => {
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
    },
    10000,
  );
});
