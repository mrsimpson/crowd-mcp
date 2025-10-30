import express, { Router } from "express";
import type { AgentRegistry } from "../registry/agent-registry.js";
import type { AgentLogStreamer } from "../services/agent-log-streamer.js";

export function createAgentsRouter(
  registry: AgentRegistry,
  logStreamer: AgentLogStreamer,
): Router {
  const router = express.Router();

  // GET /api/agents - List all agents
  router.get("/", (req, res) => {
    const agents = registry.listAgents();
    res.json({ agents });
  });

  // GET /api/agents/:id/logs/stream - Stream agent logs in real-time (SSE)
  router.get("/:id/logs/stream", async (req, res) => {
    try {
      const tail = req.query.tail
        ? parseInt(req.query.tail as string, 10)
        : undefined;

      // Set SSE headers
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      // Send initial connection message
      res.write(
        `data: ${JSON.stringify({ log: "[SSE Connected - streaming logs...]\n" })}\n\n`,
      );

      // Get log stream from Docker
      const logStream = await logStreamer.streamAgentLogs(req.params.id, tail);

      // With Tty: true, Docker returns a raw stream (not multiplexed)
      // Simply forward the data as-is
      logStream.on("data", (chunk: Buffer) => {
        const text = chunk.toString("utf-8");
        // Send as SSE event
        res.write(`data: ${JSON.stringify({ log: text })}\n\n`);
      });

      logStream.on("end", () => {
        res.write(`data: ${JSON.stringify({ end: true })}\n\n`);
        res.end();
      });

      logStream.on("error", (error: Error) => {
        res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
        res.end();
      });

      // Clean up on client disconnect
      req.on("close", () => {
        if ("destroy" in logStream && typeof logStream.destroy === "function") {
          logStream.destroy();
        }
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      // Check if headers have already been sent (SSE stream started)
      if (res.headersSent) {
        // Headers already sent, we're in SSE mode - send error as SSE event
        res.write(`data: ${JSON.stringify({ error: errorMessage })}\n\n`);
        res.end();
        return;
      }

      if (errorMessage === "Agent not found") {
        return res.status(404).json({ error: errorMessage });
      }

      res.status(500).json({ error: errorMessage });
    }
  });

  // GET /api/agents/:id/logs - Get agent logs (must be before /:id route)
  router.get("/:id/logs", async (req, res) => {
    try {
      const tail = req.query.tail
        ? parseInt(req.query.tail as string, 10)
        : undefined;
      const logs = await logStreamer.getAgentLogs(req.params.id, tail);
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
