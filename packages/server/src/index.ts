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
import { AgentDefinitionLoader } from "./agent-config/agent-definition-loader.js";
import { McpLogger } from "./mcp/mcp-logger.js";

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
        logging: {}, // Enable MCP logging protocol
      },
    },
  );

  // Create MCP logger (must be created before using it)
  const logger = new McpLogger(server, "crowd-mcp");

  // Start Agent MCP Server (SSE-based interface for agents)
  const agentMcpServer = new AgentMcpServer(
    messageRouter,
    registry,
    logger,
    agentMcpPort,
  );
  try {
    await agentMcpServer.start();
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    await logger.error("Failed to start Agent MCP Server", {
      error: errorMessage,
      port: agentMcpPort,
      suggestion: "Try setting a different port: AGENT_MCP_PORT=3101",
    });
    throw error;
  }

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    // Load available agent types dynamically
    const agentLoader = new AgentDefinitionLoader();
    let availableAgentTypes: string[] = [];
    try {
      availableAgentTypes = await agentLoader.list(workspacePath);
    } catch (error) {
      // If agent directory doesn't exist or other errors, continue with empty list
      console.error("Warning: Could not load agent types:", error);
    }

    const agentTypeDescription =
      availableAgentTypes.length > 0
        ? `Optional: The type of agent to spawn. Available types: ${availableAgentTypes.join(", ")}. If not specified, uses the default configuration.`
        : "Optional: The type of agent to spawn. No agent types configured yet. If not specified, uses the default configuration.";

    return {
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
              agentType: {
                type: "string",
                description: agentTypeDescription,
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
    };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === "spawn_agent") {
      const { task, agentType } = request.params.arguments as {
        task: string;
        agentType?: string;
      };

      const result = await mcpServer.handleSpawnAgent(task, agentType);

      let responseText = `Agent spawned successfully!\n\nID: ${result.agentId}\nTask: ${result.task}\nContainer: ${result.containerId}`;
      if (agentType) {
        responseText += `\nType: ${agentType}`;
      }
      responseText += `\n\nView and control agents at:\n${result.dashboardUrl}`;

      return {
        content: [
          {
            type: "text",
            text: responseText,
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

  // TODO: Add logging/setLevel handler when SDK properly supports custom request handlers
  // For now, log level can be set via environment variable or programmatically

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log server startup
  await logger.info("crowd-mcp server started", {
    httpPort,
    agentMcpPort,
    sessionId: sessionInfo.sessionId,
  });

  console.error("crowd-mcp server running on stdio");
}

main().catch(console.error);
