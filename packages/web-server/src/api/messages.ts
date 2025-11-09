import express, { Router } from "express";
import type { Message } from "@crowd-mcp/shared";

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
  markAsRead(messageIds: string[]): Promise<void>;
}

export function createMessagesRouter(
  messageRouter: MessageRouterInterface,
): Router {
  const router = express.Router();

  // GET /api/messages - List all messages with optional filtering
  router.get("/", async (req, res) => {
    try {
      const participant = req.query.participant as string | undefined;
      const limit = req.query.limit
        ? parseInt(req.query.limit as string, 10)
        : undefined;
      const since = req.query.since
        ? parseInt(req.query.since as string, 10)
        : undefined;

      let messages;
      if (participant) {
        // Get messages for specific participant
        messages = await messageRouter.getMessages(participant, {
          limit,
          since,
        });
      } else {
        // Get all messages - we need to implement this method
        // For now, get messages for all registered participants
        const participants = messageRouter.getRegisteredParticipants();
        const allMessages = [];

        for (const participantId of participants) {
          const participantMessages = await messageRouter.getMessages(
            participantId,
            {
              limit,
              since,
            },
          );
          allMessages.push(...participantMessages);
        }

        // Sort by timestamp (newest first)
        messages = allMessages.sort((a, b) => b.timestamp - a.timestamp);

        // Apply limit if specified
        if (limit && messages.length > limit) {
          messages = messages.slice(0, limit);
        }
      }

      res.json({ messages, count: messages.length });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: errorMessage });
    }
  });

  // GET /api/messages/stats - Get message statistics
  router.get("/stats", async (_req, res) => {
    try {
      const stats = await messageRouter.getStats();
      const participants = messageRouter.getRegisteredParticipants();

      // Get per-participant stats
      const participantStats: Record<
        string,
        { total: number; unread: number }
      > = {};
      for (const participantId of participants) {
        const participantStat =
          await messageRouter.getMessageStats(participantId);
        participantStats[participantId] = {
          total: participantStat.total,
          unread: participantStat.unread,
        };
      }

      res.json({
        totalMessages: stats.totalMessages,
        totalParticipants: stats.totalParticipants,
        participantStats,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: errorMessage });
    }
  });

  // GET /api/messages/threads - Get message threads grouped by participants
  router.get("/threads", async (_req, res) => {
    try {
      const participants = messageRouter.getRegisteredParticipants();
      const threads: Record<string, Message[]> = {};

      for (const participantId of participants) {
        const messages = await messageRouter.getMessages(participantId);
        if (messages.length > 0) {
          threads[participantId] = messages;
        }
      }

      res.json({ threads, participantCount: Object.keys(threads).length });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: errorMessage });
    }
  });

  // POST /api/messages/acknowledge - Acknowledge message delivery
  router.post("/acknowledge", express.json(), async (req, res) => {
    try {
      const { messageId, agentId } = req.body;

      if (!messageId) {
        return res.status(400).json({ error: "messageId is required" });
      }

      if (!agentId) {
        return res.status(400).json({ error: "agentId is required" });
      }

      // Mark message as read
      await messageRouter.markAsRead([messageId]);

      res.json({
        success: true,
        messageId,
        agentId,
        acknowledgedAt: Date.now(),
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: errorMessage });
    }
  });

  return router;
}
