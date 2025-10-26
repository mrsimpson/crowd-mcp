import express, { Router } from "express";
import type { AgentRegistry } from "../registry/agent-registry.js";

export function createAgentsRouter(registry: AgentRegistry): Router {
  const router = express.Router();

  // GET /api/agents - List all agents
  router.get("/", (req, res) => {
    const agents = registry.listAgents();
    res.json({ agents });
  });

  // GET /api/agents/:id/logs - Get agent logs (must be before /:id route)
  router.get("/:id/logs", async (req, res) => {
    try {
      const tail = req.query.tail
        ? parseInt(req.query.tail as string, 10)
        : undefined;
      const logs = await registry.getAgentLogs(req.params.id, tail);
      res.json({ logs });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      if (errorMessage === "Agent not found") {
        return res.status(404).json({ error: errorMessage });
      }

      res.status(500).json({ error: errorMessage });
    }
  });

  // GET /api/agents/:id - Get specific agent
  router.get("/:id", (req, res) => {
    const agent = registry.getAgent(req.params.id);

    if (!agent) {
      return res.status(404).json({ error: "Agent not found" });
    }

    res.json({ agent });
  });

  // DELETE /api/agents/:id - Stop agent
  router.delete("/:id", async (req, res) => {
    try {
      await registry.stopAgent(req.params.id);
      res.json({ success: true, message: "Agent stopped successfully" });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      if (errorMessage === "Agent not found") {
        return res.status(404).json({ error: errorMessage });
      }

      res.status(500).json({ error: errorMessage });
    }
  });

  return router;
}
