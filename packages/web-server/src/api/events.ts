import express, { Router, Request, Response } from "express";
import type { AgentRegistry } from "../registry/agent-registry.js";
import type { Agent, Message } from "@crowd-mcp/shared";

// Minimal interface for MessageRouter events
interface MessageRouterInterface {
  on(event: string, listener: (message: Message) => void): void;
  off(event: string, listener: (message: Message) => void): void;
}

export function createEventsRouter(
  registry: AgentRegistry,
  messageRouter?: MessageRouterInterface,
): Router {
  const router = express.Router();

  router.get("/", (req: Request, res: Response) => {
    // Set SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

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

    // Message event handlers (if message router is provided)
    const onMessageSent = messageRouter
      ? (message: Message) => {
          res.write(`event: message:sent\n`);
          res.write(`data: ${JSON.stringify(message)}\n\n`);
        }
      : null;

    // Register event listeners
    registry.on("agent:created", onAgentCreated);
    registry.on("agent:updated", onAgentUpdated);
    registry.on("agent:removed", onAgentRemoved);

    // Register message event listeners if available
    if (messageRouter && onMessageSent) {
      messageRouter.on("message:sent", onMessageSent);
    }

    // Clean up on client disconnect
    req.on("close", () => {
      registry.off("agent:created", onAgentCreated);
      registry.off("agent:updated", onAgentUpdated);
      registry.off("agent:removed", onAgentRemoved);

      // Clean up message event listeners
      if (messageRouter && onMessageSent) {
        messageRouter.off("message:sent", onMessageSent);
      }
    });
  });

  return router;
}
