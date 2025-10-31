#!/usr/bin/env node
/**
 * Simple MCP Notification Test Server
 *
 * This standalone server tests how MCP clients react to notifications.
 * It sends periodic notifications at different log levels to observe client behavior.
 *
 * Usage:
 *   node dist/test/notification-test-server.js
 *
 * Or configure in your MCP client (e.g., Claude Desktop, OpenCode):
 *   {
 *     "mcpServers": {
 *       "notification-test": {
 *         "command": "node",
 *         "args": ["/path/to/notification-test-server.js"]
 *       }
 *     }
 *   }
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

async function main() {
  // Create MCP server with notification capabilities
  const server = new Server(
    {
      name: "notification-test-server",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
        logging: {}, // Enable MCP logging protocol for notifications
      },
    },
  );

  console.error("🧪 MCP Notification Test Server starting...");

  // Tool to send a test notification immediately
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "send_test_notification",
          description:
            "Send a test notification to see how the client displays it",
          inputSchema: {
            type: "object",
            properties: {
              level: {
                type: "string",
                enum: [
                  "debug",
                  "info",
                  "notice",
                  "warning",
                  "error",
                  "critical",
                  "alert",
                  "emergency",
                ],
                description: "Log level for the notification",
              },
              message: {
                type: "string",
                description: "Message content",
              },
            },
            required: ["level", "message"],
          },
        },
        {
          name: "start_notification_stream",
          description: "Start sending periodic notifications (every 5 seconds)",
          inputSchema: {
            type: "object",
            properties: {
              interval: {
                type: "number",
                description: "Interval in seconds (default: 5)",
              },
            },
          },
        },
        {
          name: "stop_notification_stream",
          description: "Stop sending periodic notifications",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
      ],
    };
  });

  let notificationInterval: NodeJS.Timeout | null = null;
  let notificationCount = 0;

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (name === "send_test_notification") {
      const level = (args?.level as string) || "info";
      const message = (args?.message as string) || "Test notification";

      await sendNotification(server, level, message, {
        notificationId: Date.now(),
        manual: true,
      });

      return {
        content: [
          {
            type: "text",
            text: `Sent ${level} notification: "${message}"`,
          },
        ],
      };
    }

    if (name === "start_notification_stream") {
      const interval = (args?.interval as number) || 5;

      if (notificationInterval) {
        return {
          content: [
            {
              type: "text",
              text: "Notification stream already running. Stop it first.",
            },
          ],
        };
      }

      notificationCount = 0;
      notificationInterval = setInterval(async () => {
        notificationCount++;
        const levels = ["debug", "info", "notice", "warning", "error"];
        const level = levels[notificationCount % levels.length];

        await sendNotification(
          server,
          level,
          `Periodic notification #${notificationCount}`,
          {
            notificationId: notificationCount,
            timestamp: new Date().toISOString(),
          },
        );
      }, interval * 1000);

      return {
        content: [
          {
            type: "text",
            text: `Started notification stream (every ${interval}s). Watch for notifications!`,
          },
        ],
      };
    }

    if (name === "stop_notification_stream") {
      if (notificationInterval) {
        clearInterval(notificationInterval);
        notificationInterval = null;

        return {
          content: [
            {
              type: "text",
              text: `Stopped notification stream. Sent ${notificationCount} notifications.`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: "No notification stream is running.",
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: `Unknown tool: ${name}`,
        },
      ],
      isError: true,
    };
  });

  // Connect stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("✓ Server connected via stdio");
  console.error("📬 Ready to send test notifications");
  console.error("");
  console.error("Available tools:");
  console.error("  • send_test_notification - Send a single test notification");
  console.error("  • start_notification_stream - Start periodic notifications");
  console.error("  • stop_notification_stream - Stop periodic notifications");
  console.error("");
  console.error("Waiting for client requests...");

  // Send a welcome notification after 2 seconds
  setTimeout(async () => {
    await sendNotification(
      server,
      "info",
      "MCP Notification Test Server is ready! Use the tools to send test notifications.",
      {
        welcome: true,
        timestamp: new Date().toISOString(),
      },
    );
  }, 2000);
}

/**
 * Send a notification via MCP protocol
 */
async function sendNotification(
  server: Server,
  level: string,
  message: string,
  data?: Record<string, unknown>,
): Promise<void> {
  console.error(`[NOTIFICATION] ${level.toUpperCase()}: ${message}`);

  try {
    await server.notification({
      method: "notifications/message",
      params: {
        level,
        logger: "notification-test",
        data: {
          message,
          timestamp: new Date().toISOString(),
          ...data,
        },
      },
    });
  } catch (error) {
    console.error("Failed to send notification:", error);
  }
}

// Run the server
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
