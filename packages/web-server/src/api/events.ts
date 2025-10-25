import express, { Router, Request, Response } from 'express';
import type { AgentRegistry } from '../registry/agent-registry.js';
import type { Agent } from '@crowd-mcp/shared';

export function createEventsRouter(registry: AgentRegistry): Router {
  const router = express.Router();

  router.get('/', (req: Request, res: Response) => {
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Send initial agents list
    const agents = registry.listAgents();
    res.write(`event: init\n`);
    res.write(`data: ${JSON.stringify({ agents })}\n\n`);

    // Event handlers
    const onAgentCreated = (agent: Agent) => {
      res.write(`event: agent:created\n`);
      res.write(`data: ${JSON.stringify(agent)}\n\n`);
    };

    const onAgentUpdated = (agent: Agent) => {
      res.write(`event: agent:updated\n`);
      res.write(`data: ${JSON.stringify(agent)}\n\n`);
    };

    const onAgentRemoved = (agent: Agent) => {
      res.write(`event: agent:removed\n`);
      res.write(`data: ${JSON.stringify(agent)}\n\n`);
    };

    // Register event listeners
    registry.on('agent:created', onAgentCreated);
    registry.on('agent:updated', onAgentUpdated);
    registry.on('agent:removed', onAgentRemoved);

    // Clean up on client disconnect
    req.on('close', () => {
      registry.off('agent:created', onAgentCreated);
      registry.off('agent:updated', onAgentUpdated);
      registry.off('agent:removed', onAgentRemoved);
    });
  });

  return router;
}
