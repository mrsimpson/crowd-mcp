import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createServer, IncomingMessage, ServerResponse } from "http";
import { parse as parseUrl } from "url";
import type { MessageRouter } from "../core/message-router-jsonl.js";
import type { AgentRegistry } from "@crowd-mcp/web-server";
import { MessagingTools } from "./messaging-tools.js";

/**
 * Agent MCP Server
 *
 * Provides SSE-based MCP interface for agents running in Docker containers.
 * Agents connect via GET /sse?agentId=<id> and communicate via POST /message/<sessionId>
 */
export class AgentMcpServer {
  private httpServer;
  private transports: Map<
    string,
    { transport: SSEServerTransport; agentId: string }
  > = new Map();
  private messagingTools: MessagingTools;

  constructor(
    private messageRouter: MessageRouter,
    private agentRegistry: AgentRegistry,
    private port: number = 3100,
  ) {
    this.messagingTools = new MessagingTools(messageRouter, agentRegistry);
    this.httpServer = createServer(this.handleRequest.bind(this));
  }

  /**
   * Start the Agent MCP Server
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Listen on 0.0.0.0 to allow Docker containers to connect via host.docker.internal
      this.httpServer.listen(this.port, "0.0.0.0", () => {
        console.error(`✓ Agent MCP Server started on port ${this.port}`);
        console.error(
          `  SSE Endpoint: http://localhost:${this.port}/sse?agentId=<id>`,
        );
        console.error(
          `  POST Endpoint: http://localhost:${this.port}/message/<sessionId>`,
        );
        console.error(
          `  Container URL: http://host.docker.internal:${this.port}/sse`,
        );
        resolve();
      });

      this.httpServer.on("error", (error) => {
        console.error(`✗ Failed to start Agent MCP Server:`, error);
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
      for (const { transport } of this.transports.values()) {
        transport.close().catch(console.error);
      }
      this.transports.clear();

      this.httpServer.close((err) => {
        if (err) {
          reject(err);
        } else {
          console.error(`✓ Agent MCP Server stopped`);
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
    // Validate agent ID
    if (!agentId) {
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("Missing agentId query parameter");
      return;
    }

    // Check if agent exists
    const agent = this.agentRegistry.getAgent(agentId);
    if (!agent) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end(`Agent ${agentId} not found`);
      return;
    }

    // Create MCP server for this agent
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

    // Create SSE transport
    const transport = new SSEServerTransport(`/message/${agentId}`, res);

    // Store transport
    this.transports.set(transport.sessionId, { transport, agentId });

    // Handle transport close
    transport.onclose = () => {
      console.error(
        `Agent ${agentId} disconnected (session: ${transport.sessionId})`,
      );
      this.transports.delete(transport.sessionId);
    };

    transport.onerror = (error) => {
      console.error(`Transport error for agent ${agentId}:`, error);
      this.transports.delete(transport.sessionId);
    };

    // Connect transport to server (this automatically starts the SSE stream)
    await mcpServer.connect(transport);

    console.error(
      `✓ Agent ${agentId} connected (session: ${transport.sessionId})`,
    );

    // EXPERIMENT: Send task via SSE notification instead of stdin
    // Agent was already validated at line 149
    if (agent?.task) {
      console.error(
        `→ [EXPERIMENT] Sending task to agent ${agentId} via SSE notification`,
      );

      try {
        // Send the main task as a notification
        await mcpServer.notification({
          method: "notifications/message",
          params: {
            level: "info",
            logger: "crowd-mcp",
            data: {
              type: "task",
              content: agent.task,
            },
          },
        });

        console.error(`✓ Task notification sent to agent ${agentId}`);

        // After 1 second, send instruction to use messaging MCP
        setTimeout(async () => {
          console.error(
            `→ [EXPERIMENT] Sending follow-up instruction to agent ${agentId}`,
          );

          try {
            await mcpServer.notification({
              method: "notifications/message",
              params: {
                level: "info",
                logger: "crowd-mcp",
                data: {
                  type: "instruction",
                  content:
                    "Once you complete the task, please send a message to 'developer' using the send_message MCP tool to report your completion status.",
                },
              },
            });

            console.error(`✓ Follow-up instruction sent to agent ${agentId}`);
          } catch (error) {
            console.error(
              `✗ Failed to send follow-up instruction to agent ${agentId}:`,
              error,
            );
          }
        }, 1000);
      } catch (error) {
        console.error(
          `✗ Failed to send task notification to agent ${agentId}:`,
          error,
        );
      }
    }
  }

  /**
   * Handle POST message from agent
   */
  private async handlePostMessage(
    req: IncomingMessage,
    res: ServerResponse,
    sessionId: string,
  ): Promise<void> {
    const transportInfo = this.transports.get(sessionId);

    if (!transportInfo) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Session not found");
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
        console.error("Error handling POST message:", error);
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end("Invalid JSON");
      }
    });

    req.on("error", (error) => {
      console.error("Request error:", error);
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

    if (name === "get_messages") {
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
  getActiveConnections(): Array<{ sessionId: string; agentId: string }> {
    return Array.from(this.transports.entries()).map(
      ([sessionId, { agentId }]) => ({
        sessionId,
        agentId,
      }),
    );
  }
}
