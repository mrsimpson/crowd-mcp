import { randomUUID } from "crypto";
import type { IncomingMessage, ServerResponse } from "http";
import { EventEmitter } from "events";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";

/**
 * Session state for streamable HTTP transport
 */
export interface SessionState {
  sessionId: string;
  agentId?: string;
  createdAt: number;
  lastActivity: number;
  mcpServer?: Server;
  activeStream?: ServerResponse;
}

/**
 * Streamable HTTP Transport
 *
 * Implements the MCP Streamable HTTP transport specification:
 * https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#streamable-http
 *
 * Features:
 * - Single endpoint handling both GET and POST requests
 * - Session management with Mcp-Session-Id header
 * - Support for both JSON responses and SSE streams
 * - Message batching and stream resumability
 * - Real-time message notifications
 */
export class StreamableHttpTransport extends EventEmitter {
  private sessions: Map<string, SessionState> = new Map();
  private activeStreams: Map<string, ServerResponse> = new Map();
  private eventIdCounter = 0;

  constructor() {
    super();
  }

  /**
   * Handle HTTP GET request - for establishing SSE streams
   */
  async handleGetRequest(
    req: IncomingMessage,
    res: ServerResponse,
    sessionId?: string,
  ): Promise<void> {
    // Validate Accept header requires text/event-stream
    const acceptHeader = req.headers.accept || "";
    if (!acceptHeader.includes("text/event-stream")) {
      res.writeHead(405, { "Content-Type": "text/plain" });
      res.end("Method Not Allowed: GET requires Accept: text/event-stream");
      return;
    }

    // Validate session if provided
    if (sessionId && !this.validateSession(sessionId)) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Session not found");
      return;
    }

    // Create new session if none provided
    if (!sessionId) {
      sessionId = this.createSession();
      res.setHeader("Mcp-Session-Id", sessionId);
    }

    // Initialize SSE stream
    this.createEventStream(sessionId, res);
  }

  /**
   * Handle HTTP POST request - for JSON-RPC messages
   */
  async handlePostRequest(
    req: IncomingMessage,
    res: ServerResponse,
    body: any,
    sessionId?: string,
  ): Promise<void> {
    try {
      // Validate Accept header
      const acceptHeader = req.headers.accept || "";
      const acceptsJson = acceptHeader.includes("application/json");
      const acceptsEventStream = acceptHeader.includes("text/event-stream");

      if (!acceptsJson && !acceptsEventStream) {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end(
          "Bad Request: Accept header must include application/json or text/event-stream",
        );
        return;
      }

      // Parse JSON-RPC message
      let jsonRpcMessage;
      try {
        jsonRpcMessage = typeof body === "string" ? JSON.parse(body) : body;
      } catch (error) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            error: { code: -32700, message: "Parse error" },
            id: null,
          }),
        );
        return;
      }

      // Handle initialization without session
      if (this.isInitializeRequest(jsonRpcMessage) && !sessionId) {
        sessionId = this.createSession();
        res.setHeader("Mcp-Session-Id", sessionId);
      } else if (!sessionId) {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end("Bad Request: Mcp-Session-Id header required");
        return;
      }

      // Validate session
      if (!this.validateSession(sessionId)) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Session not found");
        return;
      }

      // Check if this is a batch of responses/notifications (no processing needed)
      if (this.isResponseOrNotificationOnly(jsonRpcMessage)) {
        res.writeHead(202);
        res.end();
        return;
      }

      // Process the request - delegate to session's MCP server
      const session = this.sessions.get(sessionId)!;
      session.lastActivity = Date.now();

      if (!session.mcpServer) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            error: {
              code: -32603,
              message: "Internal error: MCP server not available",
            },
            id: jsonRpcMessage.id || null,
          }),
        );
        return;
      }

      // For requests that expect responses, determine response type
      if (this.hasRequests(jsonRpcMessage)) {
        if (acceptsEventStream) {
          // Initiate SSE stream for response
          this.createEventStream(sessionId, res);
          // Process request asynchronously and send results via SSE
          this.processRequestAsync(session, jsonRpcMessage);
        } else {
          // Return JSON response directly
          const response = await this.processRequest(session, jsonRpcMessage);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(response));
        }
      } else {
        // No response expected (notifications only)
        res.writeHead(202);
        res.end();
      }
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal error" },
          id: null,
        }),
      );
    }
  }

  /**
   * Handle HTTP DELETE request - for session termination
   */
  async handleDeleteRequest(
    _req: IncomingMessage,
    res: ServerResponse,
    sessionId?: string,
  ): Promise<void> {
    if (!sessionId) {
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("Bad Request: Mcp-Session-Id header required");
      return;
    }

    if (this.terminateSession(sessionId)) {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("Session terminated");
    } else {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Session not found");
    }
  }

  /**
   * Create a new session
   */
  createSession(agentId?: string): string {
    const sessionId = randomUUID();
    const session: SessionState = {
      sessionId,
      agentId,
      createdAt: Date.now(),
      lastActivity: Date.now(),
    };

    this.sessions.set(sessionId, session);
    this.emit("session:created", session);
    return sessionId;
  }

  /**
   * Validate session exists and is active
   */
  validateSession(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  /**
   * Terminate a session
   */
  terminateSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    // Close active stream if exists
    if (session.activeStream) {
      this.closeStream(sessionId);
    }

    this.sessions.delete(sessionId);
    this.emit("session:terminated", sessionId);
    return true;
  }

  /**
   * Set MCP server for a session
   */
  setMcpServer(sessionId: string, mcpServer: Server): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.mcpServer = mcpServer;
    }
  }

  /**
   * Set agent ID for a session
   */
  setAgentId(sessionId: string, agentId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.agentId = agentId;
    }
  }

  /**
   * Create SSE event stream
   */
  private createEventStream(sessionId: string, res: ServerResponse): void {
    // Set SSE headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Mcp-Session-Id",
    });

    // Store stream reference
    const session = this.sessions.get(sessionId);
    if (session) {
      session.activeStream = res;
    }
    this.activeStreams.set(sessionId, res);

    // Handle client disconnect
    res.on("close", () => {
      this.closeStream(sessionId);
    });

    // Send initial connection event
    this.sendEvent(sessionId, {
      type: "connection",
      status: "established",
    });

    this.emit("stream:created", sessionId);
  }

  /**
   * Send SSE event to a session
   */
  sendEvent(sessionId: string, data: any, eventId?: string): void {
    const stream = this.activeStreams.get(sessionId);
    if (!stream) return;

    const id = eventId || `${++this.eventIdCounter}`;
    const eventData = `id: ${id}\ndata: ${JSON.stringify(data)}\n\n`;

    try {
      stream.write(eventData);
    } catch (error) {
      // Stream is closed, clean up
      this.closeStream(sessionId);
    }
  }

  /**
   * Close SSE stream
   */
  closeStream(sessionId: string): void {
    const stream = this.activeStreams.get(sessionId);
    if (stream) {
      try {
        stream.end();
      } catch (error) {
        // Stream already closed
      }
    }

    this.activeStreams.delete(sessionId);

    const session = this.sessions.get(sessionId);
    if (session) {
      session.activeStream = undefined;
    }

    this.emit("stream:closed", sessionId);
  }

  /**
   * Send message notification to agent's stream
   */
  notifyMessage(agentId: string, messageData: any): void {
    // Find session for this agent
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.agentId === agentId && this.activeStreams.has(sessionId)) {
        this.sendEvent(sessionId, {
          type: "message_notification",
          data: messageData,
        });
        break;
      }
    }
  }

  /**
   * Get active sessions
   */
  getActiveSessions(): SessionState[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Check if message is an initialize request
   */
  private isInitializeRequest(message: any): boolean {
    return message.method === "initialize";
  }

  /**
   * Check if message contains only responses/notifications
   */
  private isResponseOrNotificationOnly(message: any): boolean {
    if (Array.isArray(message)) {
      return message.every(
        (m) => !m.method || m.method.startsWith("notifications/"),
      );
    }
    return !message.method || message.method.startsWith("notifications/");
  }

  /**
   * Check if message contains requests that need responses
   */
  private hasRequests(message: any): boolean {
    if (Array.isArray(message)) {
      return message.some((m) => m.method && m.id !== undefined);
    }
    return !!(message.method && message.id !== undefined);
  }

  /**
   * Process request synchronously (for JSON responses)
   */
  private async processRequest(
    session: SessionState,
    message: any,
  ): Promise<any> {
    if (!session.mcpServer) {
      return {
        jsonrpc: "2.0",
        error: { code: -32603, message: "MCP server not available" },
        id: message.id,
      };
    }

    try {
      // Handle batch requests
      if (Array.isArray(message)) {
        const responses = [];
        for (const msg of message) {
          if (msg.method && msg.id !== undefined) {
            const response = await this.processSingleRequest(
              session.mcpServer,
              msg,
            );
            responses.push(response);
          }
        }
        return responses;
      }

      // Handle single request
      if (message.method && message.id !== undefined) {
        return await this.processSingleRequest(session.mcpServer, message);
      }

      return {
        jsonrpc: "2.0",
        error: { code: -32600, message: "Invalid Request" },
        id: message.id,
      };
    } catch (error) {
      return {
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : "Internal error",
        },
        id: message.id,
      };
    }
  }

  /**
   * Process a single MCP request
   */
  private async processSingleRequest(
    mcpServer: Server,
    request: any,
  ): Promise<any> {
    // Instead of calling mcpServer.request() which requires a transport connection,
    // we'll manually invoke the registered request handlers
    try {
      if (request.method === "tools/list") {
        // Call the handler directly via internal mechanism
        const result = await this.invokeRequestHandler(mcpServer, request);
        return {
          jsonrpc: "2.0",
          result,
          id: request.id,
        };
      } else if (request.method === "tools/call") {
        // Call the handler directly via internal mechanism
        const result = await this.invokeRequestHandler(mcpServer, request);
        return {
          jsonrpc: "2.0",
          result,
          id: request.id,
        };
      } else {
        return {
          jsonrpc: "2.0",
          error: { code: -32601, message: "Method not found" },
          id: request.id,
        };
      }
    } catch (error) {
      // Log error for debugging (could be replaced with proper logging)
      return {
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : "Internal error",
        },
        id: request.id,
      };
    }
  }

  /**
   * Invoke request handler directly by accessing server internals
   */
  private async invokeRequestHandler(
    mcpServer: Server,
    request: any,
  ): Promise<any> {
    // Access the internal request handlers map
    // This is a workaround since Server.request() requires transport connection
    const serverInternal = mcpServer as any;

    if (serverInternal._requestHandlers) {
      const handler = serverInternal._requestHandlers.get(request.method);
      if (handler) {
        return await handler(request);
      }
    }

    // Fallback: try to find handler by iterating over possible handler properties
    for (const prop of Object.getOwnPropertyNames(serverInternal)) {
      if (prop.includes("handler") || prop.includes("Handler")) {
        const handlers = serverInternal[prop];
        if (handlers && typeof handlers.get === "function") {
          const handler = handlers.get(request.method);
          if (handler) {
            return await handler(request);
          }
        }
      }
    }

    throw new Error(`No handler found for method: ${request.method}`);
  }

  /**
   * Process request asynchronously (for SSE responses)
   */
  private async processRequestAsync(
    session: SessionState,
    message: any,
  ): Promise<void> {
    try {
      const response = await this.processRequest(session, message);
      this.sendEvent(session.sessionId, response);
    } catch (error) {
      this.sendEvent(session.sessionId, {
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal error" },
        id: message.id,
      });
    }
  }
}
