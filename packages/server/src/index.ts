#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import Dockerode from "dockerode";
import { ContainerManager } from "./docker/container-manager.js";
import { McpServer } from "./mcp-server.js";
import { AgentRegistry, createHttpServer } from "@crowd-mcp/web-server";
import { MessageRouter } from "./core/message-router-jsonl.js";
import { MessagingTools } from "./mcp/messaging-tools.js";
import { MessagingLogger } from "./logging/messaging-logger.js";
import { AgentMcpServer } from "./mcp/agent-mcp-server.js";
import { DEVELOPER_ID } from "@crowd-mcp/shared";
import { ServerLogger } from "./logging/server-logger.js";
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
} from "@modelcontextprotocol/sdk/types.js";
import { ConfigValidator } from "./config/index.js";
import { AgentDefinitionLoader } from "./agent-config/agent-definition-loader.js";
import { McpLogger } from "./mcp/mcp-logger.js";

async function main() {
  const serverLogger = await ServerLogger.create();
  
  const dockerOptions: Dockerode.DockerOptions = {};

  if (process.env.DOCKER_SOCKET_PATH) {
    dockerOptions.socketPath = process.env.DOCKER_SOCKET_PATH;
  }

  const docker = new Dockerode(dockerOptions);

  // Parse ports
  const httpPort = parseInt(process.env.HTTP_PORT || "3000", 10);
  const agentMcpPort = parseInt(process.env.AGENT_MCP_PORT || "3100", 10);

  // Create shared registry
  const registry = new AgentRegistry(docker);

  // Validate OpenCode configuration (unless in demo mode)
  const isDemoMode = process.env.CROWD_DEMO_MODE === "true";
  const configValidator = new ConfigValidator();
  const workspacePath = process.cwd();
  const validationResult = await configValidator.validateConfig(workspacePath);

  if (!validationResult.valid) {
    if (isDemoMode) {
      await serverLogger.configurationValidated(); // Demo mode - skip validation
    } else {
      await serverLogger.configurationFailed([
        configValidator.formatValidationErrors(validationResult.errors)
      ]);
      process.exit(1);
    }
  } else {
    await serverLogger.configurationValidated();
  }

  // Initialize messaging logger
  const messagingLogger = await MessagingLogger.create();
  await messagingLogger.debug("Messaging system initializing");

  // Initialize messaging system
  const messageRouter = new MessageRouter({
    baseDir: process.env.MESSAGE_BASE_DIR || "./.crowd/sessions",
    sessionId: process.env.SESSION_ID, // Optional: auto-generated if not provided
    logger: messagingLogger,
  });
  await messageRouter.initialize();

  // Log session info
  const sessionInfo = messageRouter.getSessionInfo();
  // Session info logged via serverLogger

  // Register developer as participant
  messageRouter.registerParticipant(DEVELOPER_ID);

  // Connect registry events to message router
  registry.on("agent:created", (agent) => {
    messageRouter.registerParticipant(agent.id);
  });
  registry.on("agent:removed", (agent) => {
    messageRouter.unregisterParticipant(agent.id);
  });

  // Create messaging tools with logger
  const messagingTools = new MessagingTools(
    messageRouter,
    registry,
    messagingLogger,
  );

  // Start HTTP server for web UI
  let actualHttpPort: number;
  try {
    const result = await createHttpServer(
      registry,
      docker,
      httpPort,
      messageRouter,
    );
    actualHttpPort = result.port;
    await serverLogger.httpServerStarted(actualHttpPort);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    await serverLogger.httpServerFailed(httpPort, errorMessage);
    throw error;
  }

  // Start periodic sync to keep registry updated with Docker container state
  // This ensures stopped containers are removed from the registry
  const syncInterval = setInterval(async () => {
    try {
      await registry.syncFromDocker();
    } catch (error) {
      await serverLogger.registrySyncError(error);
    }
  }, 5000); // Sync every 5 seconds

  // Clean up interval on process exit
  process.on("SIGINT", () => {
    clearInterval(syncInterval);
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    clearInterval(syncInterval);
    process.exit(0);
  });

  await serverLogger.messagingSystemInitialized();

  // Create MCP SDK server first
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

  // Create MCP logger
  const logger = new McpLogger(server, "crowd-mcp");

  // Start Agent MCP Server (streamable HTTP interface for agents)
  const agentMcpServer = new AgentMcpServer(
    messageRouter,
    registry,
    logger,
    messagingLogger,
    agentMcpPort,
  );
  try {
    await agentMcpServer.start();
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    await serverLogger.agentMcpServerFailed(agentMcpPort, errorMessage);
    throw error;
  }

  // Get the actual port the agent MCP server is using (may differ from requested port)
  const actualAgentMcpPort = agentMcpServer.getPort();

  // Create ContainerManager with AgentMcpServer reference for ACP integration
  const containerManager = new ContainerManager(
    docker,
    agentMcpServer,
    actualAgentMcpPort,
  );

  // Create MCP server with logger and messaging tools
  const mcpServer = new McpServer(
    containerManager,
    registry,
    logger,
    messagingTools,
    actualHttpPort,
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    // Load available agent types dynamically
    const agentLoader = new AgentDefinitionLoader();
    let availableAgentTypes: string[] = [];
    try {
      availableAgentTypes = await agentLoader.list(workspacePath);
    } catch (error) {
      // If agent directory doesn't exist or other errors, continue with empty list
      await serverLogger.agentTypesLoadWarning(error);
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
  await serverLogger.serverStarted(
    actualHttpPort,
    actualAgentMcpPort,
    sessionInfo.sessionId,
  );

  // Server running - no output to avoid MCP interference
}

main().catch((error) => {
  process.stderr.write(`FATAL: ${error.message}\n`);
  process.exit(1);
});
