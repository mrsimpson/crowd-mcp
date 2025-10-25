import express, { Application } from 'express';
import type { Server } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createAgentsRouter } from './api/agents.js';
import { createEventsRouter } from './api/events.js';
import type { AgentRegistry } from './registry/agent-registry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function createHttpServer(
  registry: AgentRegistry,
  port: number
): Promise<Server> {
  // Sync from Docker before starting
  await registry.syncFromDocker();

  const app: Application = express();

  // Serve static files from public directory
  const publicPath = join(__dirname, '..', 'public');
  app.use(express.static(publicPath));

  // Mount API routes
  app.use('/api/agents', createAgentsRouter(registry));
  app.use('/api/events', createEventsRouter(registry));

  // Start server
  return new Promise((resolve) => {
    const server = app.listen(port, () => {
      resolve(server);
    });
  });
}
