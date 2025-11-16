import express, { Application } from "express";
import type { Server } from "http";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import type Dockerode from "dockerode";
import { createAgentsRouter } from "./api/agents.js";
import { createEventsRouter } from "./api/events.js";
import { createMessagesRouter } from "./api/messages.js";
import type { AgentRegistry } from "./registry/agent-registry.js";
import { AgentLogStreamer } from "./services/agent-log-streamer.js";
import type { Message } from "@crowd-mcp/shared";
import { DEVELOPER_ID, findAvailablePort } from "@crowd-mcp/shared";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Minimal interface for MessageRouter methods we need
interface MessageRouterInterface {
  getMessages(
    participantId: string,
    options?: { limit?: number; since?: number },
  ): Promise<Message[]>;
  getStats(): Promise<{ totalMessages: number; totalParticipants: number }>;
  getMessageStats(
    participantId: string,
  ): Promise<{ total: number; unread: number }>;
  getRegisteredParticipants(): string[];
  on(event: "message:sent", listener: (message: Message) => void): void;
  on(
    event: "agent:streaming:start",
    listener: (data: { agentId: string; prompt: string }) => void,
  ): void;
  on(
    event: "agent:streaming:chunk",
    listener: (data: {
      agentId: string;
      chunk: string;
      accumulated: string;
    }) => void,
  ): void;
  on(
    event: "agent:streaming:complete",
    listener: (data: {
      agentId: string;
      content: string;
      stopReason: string;
    }) => void,
  ): void;
  on(event: string, listener: (data: unknown) => void): void;
  off(event: "message:sent", listener: (message: Message) => void): void;
  off(
    event: "agent:streaming:start",
    listener: (data: { agentId: string; prompt: string }) => void,
  ): void;
  off(
    event: "agent:streaming:chunk",
    listener: (data: {
      agentId: string;
      chunk: string;
      accumulated: string;
    }) => void,
  ): void;
  off(
    event: "agent:streaming:complete",
    listener: (data: {
      agentId: string;
      content: string;
      stopReason: string;
    }) => void,
  ): void;
  off(event: string, listener: (data: unknown) => void): void;
}

export async function createHttpServer(
  registry: AgentRegistry,
  docker: Dockerode,
  port: number,
  messageRouter?: MessageRouterInterface,
): Promise<{ server: Server; port: number }> {
  // Sync from Docker before starting
  await registry.syncFromDocker();

  const app: Application = express();

  // Serve static files from public directory
  const publicPath = join(__dirname, "..", "public");
  app.use(express.static(publicPath));

  // Create log streamer service
  const logStreamer = new AgentLogStreamer(registry, docker);

  // Mount API routes
  app.use("/api/agents", createAgentsRouter(registry, logStreamer));
  app.use("/api/events", createEventsRouter(registry, messageRouter));

  // Mount messages API if MessageRouter is provided
  if (messageRouter) {
    app.use("/api/messages", createMessagesRouter(messageRouter));
  }

  // Config endpoint to provide runtime configuration to frontend
  app.get("/api/config", (_req, res) => {
    res.json({
      operatorId: DEVELOPER_ID,
    });
  });

  // Find an available port starting from the preferred port
  let actualPort: number;
  try {
    actualPort = await findAvailablePort(port);
    if (actualPort !== port) {
      console.error(
        `⚠️  Port ${port} is already in use, using port ${actualPort} instead`,
      );
    }
  } catch {
    throw new Error(
      `Could not find an available port starting from ${port}. ` +
        `Please set a different HTTP_PORT environment variable.`,
    );
  }

  // Start server with socket reuse enabled
  return new Promise((resolve, reject) => {
    const server = app.listen(actualPort, () => {
      resolve({ server, port: actualPort });
    });

    // Enable SO_REUSEADDR to allow port reuse immediately after shutdown
    server.on("listening", () => {
      const address = server.address();
      if (address && typeof address === "object") {
        // Set socket options for better port reuse
        try {
          // This is set automatically by Node.js on most platforms
          // but we ensure keepAliveTimeout is reasonable
          server.keepAliveTimeout = 5000; // 5 seconds
          server.headersTimeout = 6000; // 6 seconds (slightly more than keepAliveTimeout)
        } catch (error) {
          // Ignore errors setting these options
        }
      }
    });

    server.on("error", (error: NodeJS.ErrnoException) => {
      reject(error);
    });
  });
}
