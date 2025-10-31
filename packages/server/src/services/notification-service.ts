import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { Message } from "@crowd-mcp/shared";
import type { MessageRouter } from "../core/message-router-jsonl.js";
import type { McpLogger } from "../mcp/mcp-logger.js";

/**
 * NotificationService
 *
 * Monitors incoming messages and delivers notifications to the main process
 * via stdin (MCP notification protocol). This ensures that the developer/user
 * is immediately notified of new messages from agents.
 *
 * Features:
 * - Event-based message monitoring
 * - Automatic notification for developer messages
 * - MCP-compliant notification delivery
 * - Graceful error handling
 */
export class NotificationService {
  private targetParticipantId: string;
  private isStarted = false;

  constructor(
    private server: Server,
    private messageRouter: MessageRouter,
    private logger: McpLogger,
    targetParticipantId: string,
  ) {
    this.targetParticipantId = targetParticipantId;
  }

  /**
   * Start monitoring for new messages
   */
  async start(): Promise<void> {
    if (this.isStarted) {
      await this.logger.warning("NotificationService already started");
      return;
    }

    // Listen for new messages
    this.messageRouter.on("message:received", (message: Message) => {
      this.handleNewMessage(message).catch((error) => {
        this.logger.error("Error handling new message notification", {
          error: error instanceof Error ? error.message : String(error),
          messageId: message.id,
        });
      });
    });

    this.isStarted = true;
    await this.logger.info("NotificationService started", {
      targetParticipantId: this.targetParticipantId,
    });
  }

  /**
   * Stop monitoring for new messages
   */
  async stop(): Promise<void> {
    if (!this.isStarted) {
      return;
    }

    // Remove all listeners for message:received
    this.messageRouter.removeAllListeners("message:received");

    this.isStarted = false;
    await this.logger.info("NotificationService stopped");
  }

  /**
   * Handle a new message and send notification if needed
   */
  private async handleNewMessage(message: Message): Promise<void> {
    // Only notify for messages to the target participant (developer)
    if (message.to !== this.targetParticipantId) {
      return;
    }

    // Format notification message
    const notificationText = this.formatNotification(message);

    // Send via MCP notification protocol
    try {
      await this.server.notification({
        method: "notifications/message",
        params: {
          level: message.priority === "high" ? "warning" : "info",
          logger: "crowd-mcp-notifications",
          data: notificationText,
        },
      });

      await this.logger.debug("Notification sent", {
        messageId: message.id,
        from: message.from,
        priority: message.priority,
      });
    } catch (error) {
      // If notification fails, log to stderr as fallback
      await this.logger.error("Failed to send notification", {
        error: error instanceof Error ? error.message : String(error),
        messageId: message.id,
      });

      // Also log to stderr directly for visibility
      console.error(
        `[NOTIFICATION] New message from ${message.from}: ${message.content}`,
      );
    }
  }

  /**
   * Format a message into a human-readable notification
   */
  private formatNotification(message: Message): string {
    const priorityEmoji =
      message.priority === "high"
        ? "🔴"
        : message.priority === "normal"
          ? "🔵"
          : "⚪";
    const timestamp = new Date(message.timestamp).toLocaleTimeString();

    return `${priorityEmoji} New message from ${message.from} [${timestamp}]:\n${message.content}`;
  }

  /**
   * Check if service is running
   */
  isRunning(): boolean {
    return this.isStarted;
  }
}
