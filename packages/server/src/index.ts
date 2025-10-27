#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import Dockerode from "dockerode";
import { ContainerManager } from "./docker/container-manager.js";
import { McpServer } from "./mcp-server.js";
import { AgentRegistry, createHttpServer } from "@crowd-mcp/web-server";
import { MessageRouter } from "./core/message-router-jsonl.js";
import { MessagingTools } from "./mcp/messaging-tools.js";
import { AgentMcpServer } from "./mcp/agent-mcp-server.js";
import { DEVELOPER_ID } from "@crowd-mcp/shared";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { ConfigValidator } from "./config/index.js";

async function main() {
  const docker = new Dockerode();

  // Parse ports
  const httpPort = parseInt(process.env.HTTP_PORT || "3000", 10);
  const agentMcpPort = parseInt(process.env.AGENT_MCP_PORT || "3100", 10);

  const containerManager = new ContainerManager(docker, agentMcpPort);

  // Create shared registry
  const registry = new AgentRegistry(docker);

  // Validate OpenCode configuration (unless in demo mode)
  const isDemoMode = process.env.CROWD_DEMO_MODE === "true";
  const configValidator = new ConfigValidator();
  const workspacePath = process.cwd();
  const validationResult = await configValidator.validateConfig(workspacePath);

  if (!validationResult.valid) {
    if (isDemoMode) {
      console.error(
        "⚠️  OpenCode configuration validation skipped (CROWD_DEMO_MODE=true)",
      );
      console.error(
        "   Warning: Agents will not work without proper LLM provider configuration",
      );
    } else {
      console.error(
        configValidator.formatValidationErrors(validationResult.errors),
      );
      console.error("✗ Server startup failed due to configuration errors");
      console.error(
        "   Tip: Set CROWD_DEMO_MODE=true to skip validation for testing",
      );
      process.exit(1);
    }
  } else {
    console.error("✓ OpenCode configuration validated successfully");
  }

  // Initialize messaging system
  const messageRouter = new MessageRouter({
    baseDir: process.env.MESSAGE_BASE_DIR || "./.crowd/sessions",
    sessionId: process.env.SESSION_ID, // Optional: auto-generated if not provided
  });
  await messageRouter.initialize();

  // Log session info
  const sessionInfo = messageRouter.getSessionInfo();
  console.error(
    `Session: ${sessionInfo.sessionId} -> ${sessionInfo.sessionDir}`,
  );

  // Register developer as participant
  messageRouter.registerParticipant(DEVELOPER_ID);

  // Connect registry events to message router
  registry.on("agent:created", (agent) => {
    messageRouter.registerParticipant(agent.id);
  });
  registry.on("agent:removed", (agent) => {
    messageRouter.unregisterParticipant(agent.id);
  });

  // Create messaging tools
  const messagingTools = new MessagingTools(messageRouter, registry);

  // Start HTTP server for web UI
  try {
    await createHttpServer(registry, docker, httpPort);
    console.error(`✓ HTTP server started successfully`);
    console.error(`  Web Dashboard: http://localhost:${httpPort}`);
    console.error(`  API Endpoint: http://localhost:${httpPort}/api/agents`);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(`✗ Failed to start HTTP server: ${errorMessage}`);
    console.error(`  Current HTTP_PORT: ${httpPort}`);
    console.error(
      `  Try setting a different port in your MCP client configuration:`,
    );
    console.error(`  "env": { "HTTP_PORT": "3001" }`);
    throw error;
  }

  console.error(`✓ Messaging system initialized`);

  // Start Agent MCP Server (SSE-based interface for agents)
  const agentMcpServer = new AgentMcpServer(
    messageRouter,
    registry,
    agentMcpPort,
  );
  try {
    await agentMcpServer.start();
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(`✗ Failed to start Agent MCP Server: ${errorMessage}`);
    console.error(`  Current AGENT_MCP_PORT: ${agentMcpPort}`);
    console.error(
      `  Try setting a different port in your MCP client configuration:`,
    );
    console.error(`  "env": { "AGENT_MCP_PORT": "3101" }`);
    throw error;
  }

  // Create MCP server
  const mcpServer = new McpServer(containerManager, registry, httpPort);

  const server = new Server(
    {
      name: "crowd-mcp",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "spawn_agent",
        description: "Spawn a new autonomous agent in a Docker container",
        inputSchema: {
          type: "object",
          properties: {
            task: {
              type: "string",
              description: "The task for the agent to work on",
            },
          },
          required: ["task"],
        },
      },
      {
        name: "list_agents",
        description: "List all active agents with their status and details",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "stop_agent",
        description: "Stop a running agent and remove its container",
        inputSchema: {
          type: "object",
          properties: {
            agentId: {
              type: "string",
              description: "The ID of the agent to stop",
            },
          },
          required: ["agentId"],
        },
      },
      // Messaging tools
      ...messagingTools.getManagementToolDefinitions(),
    ],
  }));

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === "spawn_agent") {
      const { task } = request.params.arguments as { task: string };

      const result = await mcpServer.handleSpawnAgent(task);

      return {
        content: [
          {
            type: "text",
            text: `Agent spawned successfully!\n\nID: ${result.agentId}\nTask: ${result.task}\nContainer: ${result.containerId}\n\nView and control agents at:\n${result.dashboardUrl}`,
          },
        ],
      };
    }

    if (request.params.name === "list_agents") {
      const result = await mcpServer.handleListAgents();

      if (result.count === 0) {
        return {
          content: [
            {
              type: "text",
              text: "No agents currently running.",
            },
          ],
        };
      }

      const agentsList = result.agents
        .map(
          (agent, index) =>
            `${index + 1}. ${agent.id}\n   Task: ${agent.task}\n   Container: ${agent.containerId}`,
        )
        .join("\n\n");

      return {
        content: [
          {
            type: "text",
            text: `Active Agents (${result.count}):\n\n${agentsList}`,
          },
        ],
      };
    }

    if (request.params.name === "stop_agent") {
      const { agentId } = request.params.arguments as { agentId: string };

      const result = await mcpServer.handleStopAgent(agentId);

      return {
        content: [
          {
            type: "text",
            text: `Agent ${result.agentId} stopped successfully.`,
          },
        ],
      };
    }

    // Messaging tools
    if (request.params.name === "send_message") {
      const { to, content, priority } = request.params.arguments as {
        to: string;
        content: string;
        priority?: "low" | "normal" | "high";
      };

      const result = await messagingTools.sendMessage({
        from: DEVELOPER_ID,
        to,
        content,
        priority,
      });

      let responseText = `Message sent successfully!\n\nTo: ${result.to}\nMessage ID: ${result.messageId}`;
      if (result.recipientCount) {
        responseText += `\nRecipients: ${result.recipientCount}`;
      }

      return {
        content: [
          {
            type: "text",
            text: responseText,
          },
        ],
      };
    }

    if (request.params.name === "get_messages") {
      const { unreadOnly, limit, markAsRead } = request.params.arguments as {
        unreadOnly?: boolean;
        limit?: number;
        markAsRead?: boolean;
      };

      const result = await messagingTools.getMessages({
        participantId: DEVELOPER_ID,
        unreadOnly,
        limit,
        markAsRead,
      });

      if (result.count === 0) {
        return {
          content: [
            {
              type: "text",
              text: "No messages found.",
            },
          ],
        };
      }

      const messagesList = result.messages
        .map(
          (msg, index) =>
            `${index + 1}. From: ${msg.from}\n   ${msg.content}\n   Priority: ${msg.priority} | ${msg.read ? "Read" : "Unread"}`,
        )
        .join("\n\n");

      return {
        content: [
          {
            type: "text",
            text: `Messages (${result.count}):\n\n${messagesList}\n\nUnread: ${result.unreadCount}`,
          },
        ],
      };
    }

    if (request.params.name === "mark_messages_read") {
      const { messageIds } = request.params.arguments as {
        messageIds: string[];
      };

      const result = await messagingTools.markMessagesRead({ messageIds });

      return {
        content: [
          {
            type: "text",
            text: `Marked ${result.markedCount} message(s) as read.`,
          },
        ],
      };
    }

    throw new Error(`Unknown tool: ${request.params.name}`);
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("crowd-mcp server running on stdio");
}

main().catch(console.error);
