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
import type { McpLogger } from "./mcp-logger.js";
import { MessagingLogger } from "../logging/messaging-logger.js";
import { StreamableHttpTransport } from "./streamable-http-transport.js";
import { ACPClientManager } from "../acp/acp-client-manager.js";
import { ACPMessageForwarder } from "../acp/acp-message-forwarder.js";
import type { AcpMcpServer } from "../agent-config/acp-mcp-converter.js";

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
  private acpClientManager: ACPClientManager;
  private acpMessageForwarder: ACPMessageForwarder;

  constructor(
    private messageRouter: MessageRouter,
    private agentRegistry: AgentRegistry,
    private logger: McpLogger,
    private messagingLogger: MessagingLogger,
    private port: number = 3100,
  ) {
    this.messagingTools = new MessagingTools(messageRouter, agentRegistry, messagingLogger);
    this.transport = new StreamableHttpTransport();
    this.acpClientManager = new ACPClientManager(messageRouter);
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

    // Listen for agent removal to clean up ACP clients
    this.agentRegistry.on("agent:removed", async (agent) => {
      await this.logger.info("Agent removed from registry", {
        agentId: agent.id,
        containerId: agent.containerId,
      });
      await this.removeACPClient(agent.id);
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
          await this.logger.error("Failed to forward message via ACP", { error, messageId: message.id });
        }
      }
    });
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
      this.cleanupACPClients().catch(error => {
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
      const isForAgent = message.to !== 'developer' && message.to !== 'broadcast';
      
      if (isForAgent) {
        await this.logger.info("Forwarding message to agent via ACP", {
          messageId: message.id,
          from: message.from,
          to: message.to,
          content: message.content.substring(0, 100) + '...'
        });

        // Convert message format for ACP forwarder (timestamp: number -> Date)
        const acpMessage = {
          content: message.content,
          from: message.from,
          to: message.to,
          timestamp: new Date(message.timestamp)
        };

        // Forward message to agent via ACP
        await this.acpMessageForwarder.forwardMessage(acpMessage);
      }
    } catch (error) {
      await this.logger.error("Failed to forward message to agent", {
        error: error instanceof Error ? error.message : 'Unknown error',
        messageId: message.id
      });
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
          await this.setupMcpServerForSession(sessionId, jsonRpcMessage, agentId);

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
      } catch (error) {
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
    request: any,
    sessionId: string,
  ): Promise<any> {
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
   * Set up MCP server for a session
   */
  private async setupMcpServerForSession(
    sessionId: string,
    initRequest: any,
    headerAgentId?: string,
  ): Promise<void> {
    // Use agent ID from header if available, otherwise extract from request
    const agentId = headerAgentId ||
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

    // Register tools
    mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: this.messagingTools.getAgentToolDefinitions(),
    }));

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
  async createACPClient(agentId: string, containerId: string, mcpServers: AcpMcpServer[] = []): Promise<void> {
    try {
      await this.acpClientManager.createClient(agentId, containerId, mcpServers);
      await this.logger.info("ACP client created", { agentId, containerId, mcpServerCount: mcpServers.length });
    } catch (error) {
      await this.logger.error("Failed to create ACP client", { error, agentId, containerId });
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
      await this.logger.error("Failed to remove ACP client", { error, agentId });
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
