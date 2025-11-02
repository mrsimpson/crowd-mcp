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
  SpawnAgentArgsSchema,
  StopAgentArgsSchema,
  SendMessageArgsSchema,
  GetMessagesArgsSchema,
  MarkMessagesReadArgsSchema,
  ListAgentsArgsSchema,
  safeValidateToolArgs,
} from "./mcp/tool-schemas.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  SetLevelRequestSchema,
  CreateMessageRequestSchema,
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

  // Create MCP SDK server first (before any logging)
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

  // Create MCP logger early so we can use it throughout startup
  const logger = new McpLogger(server, "crowd-mcp");

  // Validate OpenCode configuration (unless in demo mode)
  const isDemoMode = process.env.CROWD_DEMO_MODE === "true";
  const configValidator = new ConfigValidator();
  const workspacePath = process.cwd();
  const validationResult = await configValidator.validateConfig(workspacePath);

  if (!validationResult.valid) {
    if (isDemoMode) {
      await logger.warning(
        "OpenCode configuration validation skipped (CROWD_DEMO_MODE=true)",
      );
      await logger.warning(
        "Agents will not work without proper LLM provider configuration",
      );
    } else {
      await logger.error(
        "Server startup failed due to configuration errors",
        {
          errors: validationResult.errors,
          formatted: configValidator.formatValidationErrors(
            validationResult.errors,
          ),
        },
      );
      await logger.info(
        "Tip: Set CROWD_DEMO_MODE=true to skip validation for testing",
      );
      process.exit(1);
    }
  } else {
    await logger.info("OpenCode configuration validated successfully");
  }

  // Initialize messaging system
  const messageRouter = new MessageRouter({
    baseDir: process.env.MESSAGE_BASE_DIR || "./.crowd/sessions",
    sessionId: process.env.SESSION_ID, // Optional: auto-generated if not provided
    logger,
  });
  await messageRouter.initialize();

  // Log session info
  const sessionInfo = messageRouter.getSessionInfo();
  await logger.info("Session initialized", {
    sessionId: sessionInfo.sessionId,
    sessionDir: sessionInfo.sessionDir,
  });

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
    await logger.info("HTTP server started successfully", {
      httpPort,
      dashboardUrl: `http://localhost:${httpPort}`,
      apiEndpoint: `http://localhost:${httpPort}/api/agents`,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    await logger.error("Failed to start HTTP server", {
      error: errorMessage,
      httpPort,
      suggestion: 'Try setting a different port: "env": { "HTTP_PORT": "3001" }',
    });
    throw error;
  }

  await logger.info("Messaging system initialized");

  // Create MCP server with logger and messaging tools
  const mcpServer = new McpServer(
    containerManager,
    registry,
    logger,
    messagingTools,
    httpPort,
  );

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
      agentMcpPort,
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
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      await logger.warning("Could not load agent types", {
        error: errorMessage,
      });
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
      // Validate arguments using schema
      const validation = safeValidateToolArgs(
        SpawnAgentArgsSchema,
        request.params.arguments,
        "spawn_agent",
      );

      if (!validation.success) {
        return {
          content: [
            {
              type: "text",
              text: validation.error,
            },
          ],
          isError: true,
        };
      }

      const { task, agentType } = validation.data;

      try {
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
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        await logger.error("Failed to spawn agent", {
          error: errorMessage,
          task,
          agentType,
        });

        return {
          content: [
            {
              type: "text",
              text: `Failed to spawn agent: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }

    if (request.params.name === "list_agents") {
      // Validate arguments (should be empty object)
      const validation = safeValidateToolArgs(
        ListAgentsArgsSchema,
        request.params.arguments,
        "list_agents",
      );

      if (!validation.success) {
        return {
          content: [
            {
              type: "text",
              text: validation.error,
            },
          ],
          isError: true,
        };
      }

      try {
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
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        await logger.error("Failed to list agents", { error: errorMessage });

        return {
          content: [
            {
              type: "text",
              text: `Failed to list agents: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }

    if (request.params.name === "stop_agent") {
      // Validate arguments using schema
      const validation = safeValidateToolArgs(
        StopAgentArgsSchema,
        request.params.arguments,
        "stop_agent",
      );

      if (!validation.success) {
        return {
          content: [
            {
              type: "text",
              text: validation.error,
            },
          ],
          isError: true,
        };
      }

      const { agentId } = validation.data;

      try {
        const result = await mcpServer.handleStopAgent(agentId);

        return {
          content: [
            {
              type: "text",
              text: `Agent ${result.agentId} stopped successfully.`,
            },
          ],
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        await logger.error("Failed to stop agent", {
          error: errorMessage,
          agentId,
        });

        return {
          content: [
            {
              type: "text",
              text: `Failed to stop agent: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }

    // Messaging tools
    if (request.params.name === "send_message") {
      // Validate arguments using schema
      const validation = safeValidateToolArgs(
        SendMessageArgsSchema,
        request.params.arguments,
        "send_message",
      );

      if (!validation.success) {
        return {
          content: [
            {
              type: "text",
              text: validation.error,
            },
          ],
          isError: true,
        };
      }

      const { to, content, priority } = validation.data;

      try {
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
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        await logger.error("Failed to send message", {
          error: errorMessage,
          to,
          content,
        });

        return {
          content: [
            {
              type: "text",
              text: `Failed to send message: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }

    if (request.params.name === "get_messages") {
      // Validate arguments using schema
      const validation = safeValidateToolArgs(
        GetMessagesArgsSchema,
        request.params.arguments,
        "get_messages",
      );

      if (!validation.success) {
        return {
          content: [
            {
              type: "text",
              text: validation.error,
            },
          ],
          isError: true,
        };
      }

      const { unreadOnly, limit, markAsRead } = validation.data;

      try {
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
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        await logger.error("Failed to get messages", {
          error: errorMessage,
          unreadOnly,
          limit,
          markAsRead,
        });

        return {
          content: [
            {
              type: "text",
              text: `Failed to get messages: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }

    if (request.params.name === "mark_messages_read") {
      // Validate arguments using schema
      const validation = safeValidateToolArgs(
        MarkMessagesReadArgsSchema,
        request.params.arguments,
        "mark_messages_read",
      );

      if (!validation.success) {
        return {
          content: [
            {
              type: "text",
              text: validation.error,
            },
          ],
          isError: true,
        };
      }

      const { messageIds } = validation.data;

      try {
        const result = await messagingTools.markMessagesRead({ messageIds });

        return {
          content: [
            {
              type: "text",
              text: `Marked ${result.markedCount} message(s) as read.`,
            },
          ],
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        await logger.error("Failed to mark messages read", {
          error: errorMessage,
          messageIds,
        });

        return {
          content: [
            {
              type: "text",
              text: `Failed to mark messages as read: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }

    throw new Error(`Unknown tool: ${request.params.name}`);
  });

  // Handle logging level requests
  server.setRequestHandler(SetLevelRequestSchema, async (request) => {
    const { level } = request.params;
    logger.setLevel(level);
    return {};
  });

  // TODO: Add logging/setLevel handler when SDK properly supports custom request handlers
  // For now, log level can be set via environment variable or programmatically

  // Connect to transport NOW that all handlers are set up
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log server startup
  await logger.info("crowd-mcp server started", {
    httpPort,
    agentMcpPort,
    sessionId: sessionInfo.sessionId,
  });

  await logger.info("crowd-mcp server running on stdio");

  // Start periodic message check (every minute)
  const messageCheckInterval = setInterval(async () => {
    try {
      const stats = await messageRouter.getMessageStats(DEVELOPER_ID);
      if (stats.unread > 0) {
        // 1. Write to stderr/console
        process.stderr.write(
          `\n📬 You have ${stats.unread} unread message(s) from agents!\n`,
        );
        process.stderr.write(
          `   Use the get_messages tool to read them.\n\n`,
        );

        // 2. Send MCP notification
        await server.notification({
          method: "notifications/message",
          params: {
            level: "info",
            logger: "crowd-mcp",
            data: {
              message: `You have ${stats.unread} unread message(s)`,
              timestamp: new Date().toISOString(),
              details: {
                total: stats.total,
                unread: stats.unread,
                byPriority: stats.byPriority,
              },
            },
          },
        });

        // 3. Send sampling request to trigger client action
        try {
          await server.request(
            {
              method: "sampling/createMessage",
              params: {
                messages: [
                  {
                    role: "user",
                    content: {
                      type: "text",
                      text: `You have ${stats.unread} unread message(s) from agents. Please use the get_messages tool to check them.`,
                    },
                  },
                ],
                maxTokens: 1000,
              },
            },
            CreateMessageRequestSchema,
          );
        } catch (samplingError) {
          // Sampling might not be supported by all clients, ignore errors
          await logger.debug("Sampling request failed (client may not support it)", {
            error: samplingError instanceof Error ? samplingError.message : String(samplingError),
          });
        }
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      await logger.debug("Failed to check messages", { error: errorMessage });
    }
  }, 60000); // Check every minute

  // Cleanup on process termination
  process.on("SIGINT", () => {
    clearInterval(messageCheckInterval);
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    clearInterval(messageCheckInterval);
    process.exit(0);
  });
}

main().catch((error) => {
  // If logger is not available, write directly to stderr
  const errorMessage = error instanceof Error ? error.stack || error.message : String(error);
  process.stderr.write(`Fatal error during startup: ${errorMessage}\n`);
  process.exit(1);
});
