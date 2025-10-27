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

      // Get log stream from Docker
      const logStream = await logStreamer.streamAgentLogs(req.params.id, tail);

      // Docker returns a multiplexed stream, we need to demultiplex it
      // Format: [STREAM_TYPE][SIZE][PAYLOAD]
      // STREAM_TYPE: 0=stdin, 1=stdout, 2=stderr (1 byte)
      // SIZE: payload size (4 bytes, big-endian)
      logStream.on("data", (chunk: Buffer) => {
        // Docker multiplexed stream format
        let offset = 0;
        while (offset < chunk.length) {
          // Need at least 8 bytes for header
          if (offset + 8 > chunk.length) break;

          // Read header
          const header = chunk.subarray(offset, offset + 8);
          const payloadSize =
            (header[4] << 24) |
            (header[5] << 16) |
            (header[6] << 8) |
            header[7];

          offset += 8;

          // Check if we have the full payload
          if (offset + payloadSize > chunk.length) break;

          // Extract payload
          const payload = chunk.subarray(offset, offset + payloadSize);
          const text = payload.toString("utf-8");

          // Send as SSE event
          res.write(`data: ${JSON.stringify({ log: text })}\n\n`);

          offset += payloadSize;
        }
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
