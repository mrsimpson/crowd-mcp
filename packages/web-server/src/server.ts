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
): Promise<Server> {
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

  // Start server
  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      resolve(server);
    });

    server.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE") {
        reject(
          new Error(
            `Port ${port} is already in use. ` +
              `Please set a different port using the HTTP_PORT environment variable.`,
          ),
        );
      } else {
        reject(error);
      }
    });
  });
}
