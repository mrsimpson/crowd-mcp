import express, { Application } from "express";
import type { Server } from "http";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import type Dockerode from "dockerode";
import { createAgentsRouter } from "./api/agents.js";
import { createEventsRouter } from "./api/events.js";
import type { AgentRegistry } from "./registry/agent-registry.js";
import { AgentLogStreamer } from "./services/agent-log-streamer.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function createHttpServer(
  registry: AgentRegistry,
  docker: Dockerode,
  port: number,
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
  app.use("/api/events", createEventsRouter(registry));

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
