import express, { Router } from 'express';
import type { AgentRegistry } from '../registry/agent-registry.js';

export function createAgentsRouter(registry: AgentRegistry): Router {
  const router = express.Router();

  // GET /api/agents - List all agents
  router.get('/', (req, res) => {
    const agents = registry.listAgents();
    res.json({ agents });
  });

  // GET /api/agents/:id - Get specific agent
  router.get('/:id', (req, res) => {
    const agent = registry.getAgent(req.params.id);

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    res.json({ agent });
  });

  return router;
}
