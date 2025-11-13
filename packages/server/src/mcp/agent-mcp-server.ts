import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createServer, IncomingMessage, ServerResponse } from "http";
import type { MessageRouter } from "../core/message-router-jsonl.js";
import type { AgentRegistry } from "@crowd-mcp/web-server";
import type { Message } from "@crowd-mcp/shared";
import { MessagingTools } from "./messaging-tools.js";
import { AgentSpawnerTools } from "./agent-spawner-tools.js";
import type { McpLogger } from "./mcp-logger.js";
import { MessagingLogger } from "../logging/messaging-logger.js";
import { StreamableHttpTransport } from "./streamable-http-transport.js";
import { ACPClientManager } from "../acp/acp-client-manager.js";
import { ACPMessageForwarder } from "../acp/acp-message-forwarder.js";
import type { AcpMcpServer } from "../agent-config/acp-mcp-converter.js";
import type { ContainerManager } from "../docker/container-manager.js";
import { SpawnTracker } from "../core/spawn-tracker.js";

/**
 * Agent spawner settings for an agent
 */
interface AgentSpawnerConfig {
  enabled: boolean;
  maxSpawns: number;
}

/**
 * Agent MCP Server
 *
 * Provides streamable HTTP transport MCP interface for agents running in Docker containers.
 * Agents connect via streamable HTTP transport at /mcp endpoint
 */
export class AgentMcpServer {
  private httpServer;
  private transport: StreamableHttpTransport;
  private messagingTools: MessagingTools;
  private agentSpawnerTools: AgentSpawnerTools;
  private acpClientManager: ACPClientManager;
  private acpMessageForwarder: ACPMessageForwarder;
  private spawnTracker: SpawnTracker;
  private agentSpawnerConfigs: Map<string, AgentSpawnerConfig> = new Map();

  constructor(
    private messageRouter: MessageRouter,
    private agentRegistry: AgentRegistry,
    private containerManager: ContainerManager,
    private logger: McpLogger,
    private messagingLogger: MessagingLogger,
    private port: number = 3100,
  ) {
    this.messagingTools = new MessagingTools(
      messageRouter,
      agentRegistry,
      messagingLogger,
    );
    // Initialize with default max spawns (will be overridden per agent)
    this.spawnTracker = new SpawnTracker(5);
    this.agentSpawnerTools = new AgentSpawnerTools(
      containerManager,
      agentRegistry,
      this.spawnTracker,
      this.messagingTools,
    );
    this.transport = new StreamableHttpTransport();
    this.acpClientManager = new ACPClientManager(messageRouter, messageRouter);
    this.acpMessageForwarder = new ACPMessageForwarder(this.acpClientManager);
    this.httpServer = createServer(this.handleRequest.bind(this));

    // Listen for new messages and forward to agents via ACP
    this.messageRouter.on("message:sent", async (message) => {
      await this.handleNewMessage(message);
    });

    // Listen for agent registration events to handle immediate task delivery
    this.agentRegistry.on("agent:created", async (agent) => {
      await this.logger.info("Agent registered in registry", {
        agentId: agent.id,
        containerId: agent.containerId,
      });
    });

    // Listen for agent removal to clean up ACP clients and spawn tracking
    this.agentRegistry.on("agent:removed", async (agent) => {
      await this.logger.info("Agent removed from registry", {
        agentId: agent.id,
        containerId: agent.containerId,
      });
      await this.removeACPClient(agent.id);

      // Clean up spawn tracking
      this.spawnTracker.removeSpawn(agent.id);
      this.agentSpawnerConfigs.delete(agent.id);
    });

    // Set up message router notifications for ACP message delivery
    this.messageRouter.on("message:sent", async (event) => {
      const { message } = event;
      // Only forward if the message exists and is for an agent (not from an agent)
      if (
        message &&
        message.to &&
        message.to.startsWith("agent-") &&
        message.from !== message.to
      ) {
        // Forward via ACP
        try {
          await this.acpMessageForwarder.forwardMessage(message);
        } catch (error) {
          await this.logger.error("Failed to forward message via ACP", {
            error,
            messageId: message.id,
          });
        }
      }
    });

    // Listen for streaming events to update agent status
    this.messageRouter.on(
      "agent:streaming:start",
      async (data: { agentId: string; prompt: string }) => {
        await this.handleStreamingStart(data);
      },
    );

    this.messageRouter.on(
      "agent:streaming:complete",
      async (data: {
        agentId: string;
        content: string;
        stopReason: string;
      }) => {
        await this.handleStreamingComplete(data);
      },
    );
  }

  /**
   * Start the Agent MCP Server
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.httpServer.listen(this.port, async () => {
        await this.logger.info("Agent MCP Server started", {
          port: this.port,
          endpoints: {
            mcp: `http://localhost:${this.port}/mcp`,
            container: `http://host.docker.internal:${this.port}/mcp`,
          },
        });
        resolve();
      });

      this.httpServer.on("error", async (error) => {
        await this.logger.error("Failed to start Agent MCP Server", { error });
        reject(error);
      });
    });
  }

  /**
   * Stop the Agent MCP Server
   */
  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Terminate all active sessions
      const sessions = this.transport.getActiveSessions();
      for (const session of sessions) {
        this.transport.terminateSession(session.sessionId);
      }

      // Cleanup ACP clients
      this.cleanupACPClients().catch((error) => {
        console.error("Error cleaning up ACP clients during shutdown:", error);
      });

      this.httpServer.close(async (err) => {
        if (err) {
          reject(err);
        } else {
          await this.logger.info("Agent MCP Server stopped");
          resolve();
        }
      });
    });
  }

  /**
   * Handle incoming HTTP requests
   */
  private async handleRequest(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    // Handle CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Mcp-Session-Id",
    );

    if (req.method === "OPTIONS") {
      res.writeHead(200);
      res.end();
      return;
    }

    const url = new URL(req.url || "", `http://localhost:${this.port}`);

    // GET /health - Health check
    if (req.method === "GET" && url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: "ok",
          activeSessions: this.transport.getActiveSessions().length,
        }),
      );
      return;
    }

    // All MCP requests go to /mcp endpoint
    if (url.pathname === "/mcp") {
      // Extract session ID and agent ID from headers
      const sessionId = req.headers["mcp-session-id"] as string;
      const agentId = req.headers["x-agent-id"] as string;

      if (req.method === "GET") {
        // GET requests establish event streams
        await this.transport.handleGetRequest(req, res, sessionId);
      } else if (req.method === "POST") {
        // POST requests send JSON-RPC messages
        await this.handlePostRequest(req, res, sessionId, agentId);
      } else if (req.method === "DELETE") {
        // DELETE requests terminate sessions
        await this.transport.handleDeleteRequest(req, res, sessionId);
      } else {
        res.writeHead(405, { "Content-Type": "text/plain" });
        res.end("Method not allowed");
      }
      return;
    }

    // 404 - Not found
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  }

  /**
   * Handle new messages from MessageRouter and forward to agents via ACP
   */
  private async handleNewMessage(message: Message): Promise<void> {
    try {
      // Check if message is for an agent (not from an agent to developer)
      const isForAgent =
        message.to !== "developer" && message.to !== "broadcast";

      if (isForAgent) {
        await this.logger.info("Forwarding message to agent via ACP", {
          messageId: message.id,
          from: message.from,
          to: message.to,
          content: message.content.substring(0, 100) + "...",
        });

        // Convert message format for ACP forwarder (timestamp: number -> Date)
        const acpMessage = {
          content: message.content,
          from: message.from,
          to: message.to,
          timestamp: new Date(message.timestamp),
        };

        // Forward message to agent via ACP
        await this.acpMessageForwarder.forwardMessage(acpMessage);
      }
    } catch (error) {
      await this.logger.error("Failed to forward message to agent", {
        error: error instanceof Error ? error.message : "Unknown error",
        messageId: message.id,
      });
    }
  }

  /**
   * Handle streaming start - update agent status to working
   */
  private async handleStreamingStart(data: {
    agentId: string;
    prompt: string;
  }): Promise<void> {
    try {
      const agent = this.agentRegistry.getAgent(data.agentId);
      if (agent) {
        await this.agentRegistry.updateAgent(data.agentId, {
          ...agent,
          status: "working",
        });
        await this.logger.info("Agent status updated to working", {
          agentId: data.agentId,
        });
      }
    } catch (error) {
      await this.logger.error(
        "Failed to update agent status on streaming start",
        {
          error: error instanceof Error ? error.message : "Unknown error",
          agentId: data.agentId,
        },
      );
    }
  }

  /**
   * Handle streaming complete - update agent status back to idle
   */
  private async handleStreamingComplete(data: {
    agentId: string;
    content: string;
    stopReason: string;
  }): Promise<void> {
    try {
      const agent = this.agentRegistry.getAgent(data.agentId);
      if (agent) {
        await this.agentRegistry.updateAgent(data.agentId, {
          ...agent,
          status: "idle",
        });
        await this.logger.info("Agent status updated to idle", {
          agentId: data.agentId,
          stopReason: data.stopReason,
        });
      }
    } catch (error) {
      await this.logger.error(
        "Failed to update agent status on streaming complete",
        {
          error: error instanceof Error ? error.message : "Unknown error",
          agentId: data.agentId,
        },
      );
    }
  }

  /**
   * Handle POST requests with JSON-RPC messages
   */
  private async handlePostRequest(
    req: IncomingMessage,
    res: ServerResponse,
    sessionId?: string,
    agentId?: string,
  ): Promise<void> {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });

    req.on("end", async () => {
      try {
        const jsonRpcMessage = JSON.parse(body);

        // Handle initialization specially - don't delegate to transport
        if (jsonRpcMessage.method === "initialize") {
          // Create session if needed
          if (!sessionId) {
            sessionId = this.transport.createSession();
            res.setHeader("Mcp-Session-Id", sessionId);
          }

          // Set up MCP server for this session
          await this.setupMcpServerForSession(
            sessionId,
            jsonRpcMessage,
            agentId,
          );

          // Handle the initialize request directly
          const initResponse = await this.handleInitialize(
            jsonRpcMessage,
            sessionId,
          );

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(initResponse));
          return;
        }

        // For all other requests, delegate to transport
        await this.transport.handlePostRequest(
          req,
          res,
          jsonRpcMessage,
          sessionId,
        );
      } catch {
        // Parse error
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            error: { code: -32700, message: "Parse error" },
            id: null,
          }),
        );
      }
    });
  }

  /**
   * Handle MCP initialize request
   */
  private async handleInitialize(
    request: { id?: unknown },
    sessionId: string,
  ): Promise<{
    jsonrpc: string;
    result: {
      protocolVersion: string;
      capabilities: { tools: Record<string, never> };
      serverInfo: { name: string; version: string };
    };
    id: unknown;
  }> {
    await this.logger.info("MCP initialization request", { sessionId });

    return {
      jsonrpc: "2.0",
      result: {
        protocolVersion: "2025-03-26",
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name: "crowd-mcp-agent-interface",
          version: "0.1.0",
        },
      },
      id: request.id,
    };
  }

  /**
   * Configure agent spawner settings for an agent
   */
  setAgentSpawnerConfig(
    agentId: string,
    enabled: boolean,
    maxSpawns: number = 5,
  ): void {
    this.agentSpawnerConfigs.set(agentId, { enabled, maxSpawns });
  }

  /**
   * Set up MCP server for a session
   */
  private async setupMcpServerForSession(
    sessionId: string,
    initRequest: {
      params?: {
        clientInfo?: { name?: string };
        agentId?: string;
      };
    },
    headerAgentId?: string,
  ): Promise<void> {
    // Use agent ID from header if available, otherwise extract from request
    const agentId =
      headerAgentId ||
      initRequest.params?.clientInfo?.name ||
      initRequest.params?.agentId ||
      `agent-${sessionId.substring(0, 8)}`;

    // Create MCP server for this session
    const mcpServer = new Server(
      {
        name: "crowd-mcp-agent-interface",
        version: "0.1.0",
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    // Check if agent spawner is enabled for this agent
    const spawnerConfig = this.agentSpawnerConfigs.get(agentId);
    const hasSpawner = spawnerConfig?.enabled ?? false;

    // Register tools (conditionally include spawner tools)
    mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tools: any[] = [...this.messagingTools.getAgentToolDefinitions()];
      if (hasSpawner) {
        tools.push(...this.agentSpawnerTools.getAgentToolDefinitions());
      }
      return { tools };
    });

    // Handle tool calls
    mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
      return this.handleToolCall(request, agentId);
    });

    // Bind to session
    this.transport.setMcpServer(sessionId, mcpServer);
    this.transport.setAgentId(sessionId, agentId);

    // Register agent in message router for notifications
    this.messageRouter.registerParticipant(agentId);

    await this.logger.info("MCP server configured for session", {
      sessionId,
      agentId,
      hasSpawner,
    });
  }

  /**
   * Handle tool calls from agents
   */
  private async handleToolCall(
    request: { params: { name: string; arguments?: Record<string, unknown> } },
    agentId: string,
  ): Promise<{
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
  }> {
    const { name, arguments: args = {} } = request.params;

    // Log tool calls
    await this.logger.debug("Agent calling tool", {
      agentId,
      tool: name,
      arguments: args,
    });

    try {
      if (name === "send_message") {
        const { to, content, priority } = args as {
          to: string;
          content: string;
          priority?: "low" | "normal" | "high";
        };

        const result = await this.messagingTools.sendMessage({
          from: agentId,
          to,
          content,
          priority,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  messageId: result.messageId,
                  to: result.to,
                  timestamp: result.timestamp,
                  recipientCount: result.recipientCount,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      if (name === "get_my_messages") {
        const { unreadOnly, limit, markAsRead } = args as {
          unreadOnly?: boolean;
          limit?: number;
          markAsRead?: boolean;
        };

        const result = await this.messagingTools.getMessages({
          participantId: agentId,
          unreadOnly: unreadOnly ?? false,
          limit,
          markAsRead: markAsRead ?? true,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      if (name === "discover_agents") {
        const { status, capability } = args as {
          status?: string;
          capability?: string;
        };

        const result = await this.messagingTools.discoverAgents({
          status,
          capability,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      if (name === "mark_messages_read") {
        const { messageIds } = args as { messageIds: string[] };

        const result = await this.messagingTools.markMessagesRead({
          messageIds,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      // Agent spawner tools
      if (name === "spawn_agent") {
        const { task, agentType } = args as {
          task: string;
          agentType?: string;
        };

        const result = await this.agentSpawnerTools.spawnAgent(
          { task, agentType },
          agentId,
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      if (name === "list_spawned_agents") {
        const result = await this.agentSpawnerTools.listSpawnedAgents(agentId);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      if (name === "stop_spawned_agent") {
        const { agentId: targetAgentId } = args as { agentId: string };

        const result = await this.agentSpawnerTools.stopSpawnedAgent(
          { agentId: targetAgentId },
          agentId,
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      if (name === "get_spawn_limits") {
        const result = await this.agentSpawnerTools.getSpawnLimits(agentId);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      // Unknown tool
      await this.logger.warning("Unknown tool called", {
        agentId,
        tool: name,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: false,
              error: `Unknown tool: ${name}`,
            }),
          },
        ],
        isError: true,
      };
    } catch (error) {
      await this.logger.error("Tool call failed", {
        agentId,
        tool: name,
        error: error instanceof Error ? error.message : "Unknown error",
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : "Unknown error",
            }),
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Get active connections info
   */
  getActiveConnections(): Array<{ agentId: string; sessionId: string }> {
    return this.transport.getActiveSessions().map((session) => ({
      agentId: session.agentId || "unknown",
      sessionId: session.sessionId,
    }));
  }

  /**
   * Create ACP client for agent container
   */
  async createACPClient(
    agentId: string,
    containerId: string,
    mcpServers: AcpMcpServer[] = [],
  ): Promise<void> {
    try {
      await this.acpClientManager.createClient(
        agentId,
        containerId,
        mcpServers,
      );
      await this.logger.info("ACP client created", {
        agentId,
        containerId,
        mcpServerCount: mcpServers.length,
      });
    } catch (error) {
      await this.logger.error("Failed to create ACP client", {
        error,
        agentId,
        containerId,
      });
      throw error;
    }
  }

  /**
   * Remove ACP client for agent
   */
  async removeACPClient(agentId: string): Promise<void> {
    try {
      await this.acpClientManager.removeClient(agentId);
      await this.logger.info("ACP client removed", { agentId });
    } catch (error) {
      await this.logger.error("Failed to remove ACP client", {
        error,
        agentId,
      });
    }
  }

  /**
   * Get ACP health status for all agents
   */
  getACPHealthStatus(): { agentId: string; healthy: boolean }[] {
    return this.acpClientManager.getHealthStatus();
  }

  /**
   * Cleanup all ACP clients
   */
  async cleanupACPClients(): Promise<void> {
    try {
      await this.acpClientManager.cleanup();
      await this.logger.info("All ACP clients cleaned up");
    } catch (error) {
      await this.logger.error("Failed to cleanup ACP clients", { error });
    }
  }
}
