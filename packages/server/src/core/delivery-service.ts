import { promises as fs } from "fs";
import { watch } from "fs";
import type { MessageRouter } from "./message-router-jsonl.js";
import type { Message } from "@crowd-mcp/shared";

export interface DeliveryServiceConfig {
  recipientId: string;
  checkIntervalMs?: number;
}

/**
 * DeliveryService monitors incoming messages and notifies the recipient
 *
 * This service does NOT use RPC/MCP protocol. Instead, it outputs simple
 * text notifications to stderr, as if a human typed them in the console.
 *
 * Example output: "📬 You've got mail! New message from agent-123"
 */
export class DeliveryService {
  private recipientId: string;
  private checkIntervalMs: number;
  private messageRouter: MessageRouter;
  private lastCheckedTimestamp: number = 0;
  private isRunning: boolean = false;
  private checkInterval?: NodeJS.Timeout;
  private fileWatcher?: ReturnType<typeof watch>;

  constructor(messageRouter: MessageRouter, config: DeliveryServiceConfig) {
    this.messageRouter = messageRouter;
    this.recipientId = config.recipientId;
    this.checkIntervalMs = config.checkIntervalMs || 5000; // Default: check every 5 seconds
  }

  /**
   * Start the delivery service
   *
   * The service will periodically check for new unread messages
   * and output notifications to stderr
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.lastCheckedTimestamp = Date.now();

    // Log startup (to stderr, not MCP protocol)
    this.outputToConsole(`DeliveryService started for ${this.recipientId}`);

    // Start periodic checking
    this.checkInterval = setInterval(async () => {
      await this.checkForNewMessages();
    }, this.checkIntervalMs);

    // Also set up file watcher for immediate notifications
    await this.setupFileWatcher();
  }

  /**
   * Stop the delivery service
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    // Stop interval
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = undefined;
    }

    // Stop file watcher
    if (this.fileWatcher) {
      this.fileWatcher.close();
      this.fileWatcher = undefined;
    }

    this.outputToConsole(`DeliveryService stopped for ${this.recipientId}`);
  }

  /**
   * Check for new messages and notify
   */
  private async checkForNewMessages(): Promise<void> {
    try {
      // Get unread messages since last check
      const messages = await this.messageRouter.getMessages(this.recipientId, {
        unreadOnly: true,
        since: this.lastCheckedTimestamp,
      });

      // Update last checked timestamp
      this.lastCheckedTimestamp = Date.now();

      // Notify about new messages
      if (messages.length > 0) {
        this.notifyNewMessages(messages);
      }
    } catch {
      // Silently handle errors (don't spam stderr)
      // We'll try again on next check
    }
  }

  /**
   * Set up file watcher for immediate notifications
   */
  private async setupFileWatcher(): Promise<void> {
    try {
      const sessionInfo = this.messageRouter.getSessionInfo();
      const messagesFilePath = `${sessionInfo.sessionDir}/messages.jsonl`;

      // Check if file exists
      try {
        await fs.access(messagesFilePath);
      } catch {
        // File doesn't exist yet, that's ok
        return;
      }

      // Watch for changes
      this.fileWatcher = watch(messagesFilePath, async (eventType) => {
        if (eventType === "change") {
          // File changed, check for new messages
          await this.checkForNewMessages();
        }
      });
    } catch {
      // File watching is optional, continue without it
    }
  }

  /**
   * Notify about new messages (output to stderr as plain text)
   */
  private notifyNewMessages(messages: Message[]): void {
    // Output notification like a human would type it
    if (messages.length === 1) {
      const msg = messages[0];
      this.outputToConsole(
        `\n📬 You've got mail! New message from ${msg.from}`,
      );
      this.outputToConsole(
        `   Priority: ${msg.priority} | ${this.formatTimestamp(msg.timestamp)}`,
      );

      // Show a preview of the message content (first 100 chars)
      const preview = msg.content.substring(0, 100);
      const truncated = msg.content.length > 100 ? "..." : "";
      this.outputToConsole(`   "${preview}${truncated}"`);
      this.outputToConsole(`   Use get_messages tool to read your messages.\n`);
    } else {
      this.outputToConsole(
        `\n📬 You've got mail! ${messages.length} new messages`,
      );

      // List senders
      const senders = [...new Set(messages.map((m) => m.from))];
      if (senders.length === 1) {
        this.outputToConsole(`   From: ${senders[0]}`);
      } else {
        this.outputToConsole(`   From: ${senders.join(", ")}`);
      }

      // Show priority breakdown
      const highPriority = messages.filter((m) => m.priority === "high").length;
      if (highPriority > 0) {
        this.outputToConsole(`   ⚠️  ${highPriority} high priority message(s)`);
      }

      this.outputToConsole(`   Use get_messages tool to read your messages.\n`);
    }
  }

  /**
   * Output text to console (stderr, not stdout which is used for MCP)
   */
  private outputToConsole(text: string): void {
    // Use console.error to write to stderr
    // This is what the MCP client will see, as if typed by a human
    console.error(text);
  }

  /**
   * Format timestamp for display
   */
  private formatTimestamp(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;

    if (diff < 60000) {
      // Less than 1 minute
      return "just now";
    } else if (diff < 3600000) {
      // Less than 1 hour
      const minutes = Math.floor(diff / 60000);
      return `${minutes} minute${minutes !== 1 ? "s" : ""} ago`;
    } else if (diff < 86400000) {
      // Less than 1 day
      const hours = Math.floor(diff / 3600000);
      return `${hours} hour${hours !== 1 ? "s" : ""} ago`;
    } else {
      // Format as date
      const date = new Date(timestamp);
      return date.toLocaleString();
    }
  }
}
