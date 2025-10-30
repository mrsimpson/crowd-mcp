import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createServer, IncomingMessage, ServerResponse } from "http";
import { parse as parseUrl } from "url";
import type { MessageRouter } from "../core/message-router-jsonl.js";
import type { AgentRegistry } from "@crowd-mcp/web-server";
import { MessagingTools } from "./messaging-tools.js";
import type { McpLogger } from "./mcp-logger.js";
import { z } from "zod";

// Schema for sampling/createMessage response
const SamplingResponseSchema = z.object({
  model: z.string().optional(),
  stopReason: z.string().optional(),
  role: z.string(),
  content: z.object({
    type: z.string(),
    text: z.string(),
  }),
});

/**
 * Agent MCP Server
 *
 * Provides SSE-based MCP interface for agents running in Docker containers.
 * Agents connect via GET /sse?agentId=<id> and communicate via POST /message/<sessionId>
 */
export class AgentMcpServer {
  private httpServer;
  // Map of agentId -> transport and server info
  private transports: Map<
    string,
    { transport: SSEServerTransport; agentId: string; mcpServer: Server }
  > = new Map();
  private messagingTools: MessagingTools;

  constructor(
    private messageRouter: MessageRouter,
    private agentRegistry: AgentRegistry,
    private logger: McpLogger,
    private port: number = 3100,
  ) {
    this.messagingTools = new MessagingTools(messageRouter, agentRegistry);
    this.httpServer = createServer(this.handleRequest.bind(this));

    // Listen for agent registration events to handle immediate task delivery
    this.agentRegistry.on("agent:created", async (agent) => {
      await this.logger.info("Agent registered in registry", {
        agentId: agent.id,
        containerId: agent.containerId,
      });
    });

    // Listen for new messages and send notifications to agents
    this.messageRouter.on("message:received", async (event) => {
      // Check if this message is for an agent with an active connection
      const transportInfo = this.transports.get(event.to);
      if (transportInfo) {
        try {
          await this.logger.info(
            "New message for agent, sending notification",
            {
              agentId: event.to,
              messageId: event.messageId,
              from: event.from,
              priority: event.priority,
            },
          );

          await transportInfo.mcpServer.notification({
            method: "notifications/resources/updated",
            params: {
              uri: `resource://messages/${event.to}`,
            },
          });

          await this.logger.info("Resource update notification sent to agent", {
            agentId: event.to,
            messageId: event.messageId,
            resourceUri: `resource://messages/${event.to}`,
          });

          // Try to actively trigger the agent to check messages via sampling
          try {
            await this.logger.info(
              "Requesting agent to check messages via sampling",
              {
                agentId: event.to,
                messageId: event.messageId,
              },
            );

            const samplingResult = await transportInfo.mcpServer.request(
              {
                method: "sampling/createMessage",
                params: {
                  messages: [
                    {
                      role: "user",
                      content: {
                        type: "text",
                        text: `You have received a new message from ${event.from}. Please use the get_my_messages tool to read it and respond appropriately.`,
                      },
                    },
                  ],
                  systemPrompt:
                    "You are an AI assistant working on a task. Check your messages from other agents or the developer and respond to any new information, questions, or task updates.",
                  maxTokens: 2000,
                },
              },
              SamplingResponseSchema,
            );

            await this.logger.info("Agent sampling request completed", {
              agentId: event.to,
              messageId: event.messageId,
              model: samplingResult.model || "unknown",
              stopReason: samplingResult.stopReason || "unknown",
            });
          } catch (samplingError) {
            // Sampling might not be supported by client, that's okay
            await this.logger.debug(
              "Agent sampling request failed (client may not support it)",
              {
                agentId: event.to,
                error:
                  samplingError instanceof Error
                    ? samplingError.message
                    : String(samplingError),
                messageId: event.messageId,
              },
            );
          }
        } catch (error) {
          await this.logger.error("Failed to send notification to agent", {
            agentId: event.to,
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            event,
          });
        }
      } else {
        await this.logger.debug(
          "Message received for agent without active connection",
          {
            agentId: event.to,
            messageId: event.messageId,
            from: event.from,
          },
        );
      }
    });
  }

  /**
   * Start the Agent MCP Server
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Listen on 0.0.0.0 to allow Docker containers to connect via host.docker.internal
      this.httpServer.listen(this.port, "0.0.0.0", async () => {
        await this.logger.info("Agent MCP Server started", {
          port: this.port,
          endpoints: {
            sse: `http://localhost:${this.port}/sse?agentId=<id>`,
            post: `http://localhost:${this.port}/message/<sessionId>`,
            container: `http://host.docker.internal:${this.port}/sse`,
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
      // Close all transports
      for (const info of this.transports.values()) {
        info.transport.close().catch((error) => {
          this.logger.error("Error closing transport", { error });
        });
      }
      this.transports.clear();

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
  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    const url = parseUrl(req.url || "", true);

    // Handle CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(200);
      res.end();
      return;
    }

    // GET /sse?agentId=<id> - Establish SSE connection
    if (req.method === "GET" && url.pathname === "/sse") {
      this.handleSseConnection(
        req,
        res,
        url.query.agentId as string | undefined,
      );
      return;
    }

    // POST /message/<sessionId> - Receive message from agent
    const postMatch = url.pathname?.match(/^\/message\/([^/]+)$/);
    if (req.method === "POST" && postMatch) {
      const sessionId = postMatch[1];
      this.handlePostMessage(req, res, sessionId);
      return;
    }

    // GET /health - Health check
    if (req.method === "GET" && url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: "ok",
          activeConnections: this.transports.size,
        }),
      );
      return;
    }

    // 404 - Not found
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  }

  /**
   * Handle SSE connection establishment
   */
  private async handleSseConnection(
    req: IncomingMessage,
    res: ServerResponse,
    agentId: string | undefined,
  ): Promise<void> {
    // Log connection attempt
    await this.logger.info("Agent attempting to connect via SSE", {
      agentId: agentId || "(missing)",
      remoteAddress: req.socket.remoteAddress,
    });

    // Validate agent ID
    if (!agentId) {
      await this.logger.warning("SSE connection rejected: missing agentId", {
        remoteAddress: req.socket.remoteAddress,
      });
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("Missing agentId query parameter");
      return;
    }

    // Check if agent exists (with retry logic for race conditions)
    let agent = this.agentRegistry.getAgent(agentId);
    if (!agent) {
      // Agent might not be registered yet due to race condition
      // Wait a bit and retry a few times
      const maxRetries = 5;
      const retryDelayMs = 200;

      await this.logger.info("Agent not found in registry, retrying...", {
        agentId,
        maxRetries,
        retryDelayMs,
      });

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        agent = this.agentRegistry.getAgent(agentId);

        if (agent) {
          await this.logger.info("Agent found after retry", {
            agentId,
            attempt,
            totalWaitMs: attempt * retryDelayMs,
          });
          break;
        }

        await this.logger.debug(
          `Agent still not found, attempt ${attempt}/${maxRetries}`,
          {
            agentId,
          },
        );
      }

      if (!agent) {
        await this.logger.warning(
          "SSE connection rejected: agent not found after retries",
          {
            agentId,
            retriesAttempted: maxRetries,
            totalWaitMs: maxRetries * retryDelayMs,
          },
        );
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end(`Agent ${agentId} not found`);
        return;
      }
    }

    await this.logger.info("Agent validated, creating MCP server", {
      agentId,
      task: agent.task,
    });

    // Create MCP server for this agent
    const mcpServer = new Server(
      {
        name: "crowd-mcp-agent-interface",
        version: "0.1.0",
      },
      {
        capabilities: {
          tools: {},
          resources: {}, // Enable resources for message notifications
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

    // Handle resource list requests
    mcpServer.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: [
          {
            uri: `resource://messages/${agentId}`,
            name: `Messages for ${agentId}`,
            description: `Messages sent to agent ${agentId}`,
            mimeType: "application/json",
          },
        ],
      };
    });

    // Handle resource read requests
    mcpServer.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const uri = request.params.uri;

      // Parse URI: resource://messages/{participantId}
      const match = uri.match(/^resource:\/\/messages\/(.+)$/);
      if (!match) {
        throw new Error(`Invalid resource URI: ${uri}`);
      }

      const participantId = match[1];

      // Only allow agent to read their own messages
      if (participantId !== agentId) {
        throw new Error(
          `Unauthorized: Cannot read messages for ${participantId}`,
        );
      }

      // Get messages
      const result = await this.messagingTools.getMessages({
        participantId,
        unreadOnly: true, // Only return unread messages for resources
      });

      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(
              {
                count: result.count,
                unreadCount: result.unreadCount,
                messages: result.messages,
              },
              null,
              2,
            ),
          },
        ],
      };
    });

    await this.logger.info("Creating SSE transport", { agentId });

    // Create SSE transport - the endpoint path determines where client will POST
    const transport = new SSEServerTransport(`/message/${agentId}`, res);

    // Store transport and server by agentId (matches the POST endpoint path)
    this.transports.set(agentId, { transport, agentId, mcpServer });

    // Handle transport close
    transport.onclose = async () => {
      await this.logger.info("Agent disconnected", {
        agentId,
        sessionId: transport.sessionId,
      });
      this.transports.delete(agentId);
    };

    transport.onerror = async (error) => {
      await this.logger.error("Transport error", { agentId, error });
      this.transports.delete(agentId);
    };

    await this.logger.info("Connecting MCP server to transport", { agentId });

    // Connect transport to server (this automatically starts the SSE stream)
    await mcpServer.connect(transport);

    await this.logger.info("Agent SSE connection established", {
      agentId,
      sessionId: transport.sessionId,
      postEndpoint: `/message/${agentId}`,
    });

    // Task delivery handled via messaging system + stdin during container startup
    // SSE connection ready for real-time messaging notifications
    await this.logger.info("SSE connection ready for messaging notifications", {
      agentId,
      taskDeliveryMethod: "messaging-system-plus-stdin",
    });
  }

  /**
   * Handle POST message from agent
   * The sessionId parameter is actually the agentId (from URL path /message/{agentId})
   */
  private async handlePostMessage(
    req: IncomingMessage,
    res: ServerResponse,
    sessionId: string,
  ): Promise<void> {
    // sessionId here is actually agentId from the URL path
    const agentId = sessionId;
    const transportInfo = this.transports.get(agentId);

    if (!transportInfo) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end(
        `Agent ${agentId} session not found. Agent may not be connected.`,
      );
      await this.logger.warning("POST for unknown agent", { agentId });
      return;
    }

    // Read request body
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });

    req.on("end", async () => {
      try {
        const parsedBody = JSON.parse(body);
        await transportInfo.transport.handlePostMessage(req, res, parsedBody);
      } catch (error) {
        await this.logger.error("Error handling POST message", {
          agentId,
          error,
        });
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end("Invalid JSON");
      }
    });

    req.on("error", async (error) => {
      await this.logger.error("Request error", { agentId, error });
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Internal server error");
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

    if (name === "send_message") {
      const { to, content, priority } = args as {
        to: string;
        content: string;
        priority?: "low" | "normal" | "high";
      };

      const result = await this.messagingTools.sendMessage({
        from: agentId, // Agent is the sender
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
        participantId: agentId, // Get messages for this agent
        unreadOnly,
        limit,
        markAsRead,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                count: result.count,
                unreadCount: result.unreadCount,
                messages: result.messages,
              },
              null,
              2,
            ),
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
            text: JSON.stringify(
              {
                success: true,
                count: result.count,
                agents: result.agents,
              },
              null,
              2,
            ),
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
            text: JSON.stringify(
              {
                success: true,
                markedCount: result.markedCount,
              },
              null,
              2,
            ),
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
            text: JSON.stringify(
              {
                success: true,
                count: result.count,
                agents: result.agents,
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    // Unknown tool
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
  }

  /**
   * Get active connections info
   */
  getActiveConnections(): Array<{ agentId: string; sessionId: string }> {
    return Array.from(this.transports.entries()).map(([agentId, info]) => ({
      agentId,
      sessionId: info.transport.sessionId,
    }));
  }
}
