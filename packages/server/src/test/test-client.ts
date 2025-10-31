#!/usr/bin/env node
/**
 * Simple MCP Client for Testing Notification Server
 *
 * This script connects to the notification test server and triggers
 * various notification scenarios to observe client behavior.
 *
 * Usage:
 *   npm run test:notifications
 */

import { spawn } from "child_process";
import { EventEmitter } from "events";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}

class McpTestClient extends EventEmitter {
  private process: ReturnType<typeof spawn>;
  private requestId = 0;
  private pendingRequests = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();
  private buffer = "";

  constructor(serverPath: string) {
    super();

    console.log(`Starting server: node ${serverPath}`);
    this.process = spawn("node", [serverPath], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.process.stdout?.on("data", (data) => {
      this.buffer += data.toString();
      this.processBuffer();
    });

    this.process.stderr?.on("data", (data) => {
      console.log(`[SERVER] ${data.toString().trim()}`);
    });

    this.process.on("error", (error) => {
      console.error("Process error:", error);
    });

    this.process.on("exit", (code) => {
      console.log(`Server exited with code ${code}`);
    });
  }

  private processBuffer() {
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const message = JSON.parse(line);

        if ("id" in message) {
          // Response
          const response = message as JsonRpcResponse;
          const pending = this.pendingRequests.get(response.id);

          if (pending) {
            this.pendingRequests.delete(response.id);

            if (response.error) {
              pending.reject(
                new Error(
                  `JSON-RPC Error: ${response.error.message} (${response.error.code})`,
                ),
              );
            } else {
              pending.resolve(response.result);
            }
          }
        } else if ("method" in message) {
          // Notification
          const notification = message as JsonRpcNotification;
          console.log(`\n📬 NOTIFICATION RECEIVED:`);
          console.log(JSON.stringify(notification, null, 2));
          this.emit("notification", notification);
        }
      } catch (error) {
        console.error("Failed to parse message:", line, error);
      }
    }
  }

  async request(method: string, params?: unknown): Promise<unknown> {
    const id = ++this.requestId;

    const request: JsonRpcRequest = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      this.process.stdin?.write(JSON.stringify(request) + "\n");

      // Timeout after 10 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request timeout: ${method}`));
        }
      }, 10000);
    });
  }

  async initialize() {
    return await this.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {
        logging: {},
      },
      clientInfo: {
        name: "notification-test-client",
        version: "1.0.0",
      },
    });
  }

  async callTool(name: string, args: Record<string, unknown> = {}) {
    return await this.request("tools/call", {
      name,
      arguments: args,
    });
  }

  async listTools() {
    return await this.request("tools/list");
  }

  close() {
    this.process.kill();
  }
}

async function main() {
  const serverPath =
    process.argv[2] || "./dist/test/notification-test-server.js";

  console.log("=".repeat(60));
  console.log("MCP Notification Test Client");
  console.log("=".repeat(60));

  const client = new McpTestClient(serverPath);

  // Track notifications received
  let notificationCount = 0;
  client.on("notification", () => {
    notificationCount++;
  });

  try {
    // Wait for server to start
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Initialize
    console.log("\n1️⃣  Initializing connection...");
    const initResult = await client.initialize();
    console.log("✓ Initialized:", JSON.stringify(initResult, null, 2));

    // List tools
    console.log("\n2️⃣  Listing available tools...");
    const tools = await client.listTools();
    console.log("✓ Tools available:", JSON.stringify(tools, null, 2));

    // Wait for welcome notification
    console.log("\n3️⃣  Waiting for welcome notification (2s)...");
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Send test notification
    console.log("\n4️⃣  Sending test INFO notification...");
    const result1 = await client.callTool("send_test_notification", {
      level: "info",
      message: "This is a test INFO notification",
    });
    console.log("✓ Result:", result1);

    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Send test warning
    console.log("\n5️⃣  Sending test WARNING notification...");
    const result2 = await client.callTool("send_test_notification", {
      level: "warning",
      message: "This is a test WARNING notification",
    });
    console.log("✓ Result:", result2);

    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Send test error
    console.log("\n6️⃣  Sending test ERROR notification...");
    const result3 = await client.callTool("send_test_notification", {
      level: "error",
      message: "This is a test ERROR notification",
    });
    console.log("✓ Result:", result3);

    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Start notification stream
    console.log("\n7️⃣  Starting notification stream (10s)...");
    const result4 = await client.callTool("start_notification_stream", {
      interval: 2,
    });
    console.log("✓ Result:", result4);

    // Wait for notifications
    await new Promise((resolve) => setTimeout(resolve, 10000));

    // Stop stream
    console.log("\n8️⃣  Stopping notification stream...");
    const result5 = await client.callTool("stop_notification_stream", {});
    console.log("✓ Result:", result5);

    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Summary
    console.log("\n" + "=".repeat(60));
    console.log("TEST SUMMARY");
    console.log("=".repeat(60));
    console.log(`Total notifications received: ${notificationCount}`);
    console.log("\nExpected notifications:");
    console.log("  • 1x welcome notification (INFO)");
    console.log("  • 1x manual INFO notification");
    console.log("  • 1x manual WARNING notification");
    console.log("  • 1x manual ERROR notification");
    console.log("  • ~5x stream notifications (various levels)");
    console.log(`  • Total expected: ~9 notifications`);
    console.log("");

    if (notificationCount >= 9) {
      console.log("✅ SUCCESS: All expected notifications received!");
    } else if (notificationCount > 0) {
      console.log(
        `⚠️  PARTIAL: Only ${notificationCount}/~9 notifications received`,
      );
    } else {
      console.log("❌ FAILURE: No notifications received");
      console.log("\nPossible reasons:");
      console.log("  • Client doesn't support MCP notifications");
      console.log("  • Notifications are filtered by log level");
      console.log("  • Notifications are shown elsewhere (check UI)");
    }

    console.log("\n" + "=".repeat(60));
  } catch (error) {
    console.error("\n❌ Test failed:", error);
  } finally {
    client.close();
    process.exit(0);
  }
}

main().catch(console.error);
