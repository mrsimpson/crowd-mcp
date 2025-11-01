import { promises as fs } from "fs";
import { watch } from "fs";
import type { MessageRouter } from "./message-router-jsonl.js";
import type { Message } from "@crowd-mcp/shared";
import type { McpLogger } from "../mcp/mcp-logger.js";

export interface DeliveryServiceConfig {
  recipientId: string;
  checkIntervalMs?: number;
  logger?: McpLogger;
}

/**
 * DeliveryService - Simple Multi-Channel Notification System
 *
 * Notifies the developer about new messages using:
 * 1. stderr console output (always visible in logs)
 * 2. MCP notification/message (standard protocol, though often ignored)
 * 3. File marker (for external monitoring/polling)
 */
export class DeliveryService {
  private recipientId: string;
  private checkIntervalMs: number;
  private messageRouter: MessageRouter;
  private logger?: McpLogger;
  private lastCheckedTimestamp: number = 0;
  private isRunning: boolean = false;
  private checkInterval?: NodeJS.Timeout;
  private fileWatcher?: ReturnType<typeof watch>;
  private notificationCount: number = 0;

  constructor(messageRouter: MessageRouter, config: DeliveryServiceConfig) {
    this.messageRouter = messageRouter;
    this.recipientId = config.recipientId;
    this.checkIntervalMs = config.checkIntervalMs || 5000;
    this.logger = config.logger;
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.lastCheckedTimestamp = Date.now();

    console.error(`✓ DeliveryService started for ${this.recipientId}`);

    // Start periodic checking
    this.checkInterval = setInterval(async () => {
      await this.checkForNewMessages();
    }, this.checkIntervalMs);

    // Set up file watcher for immediate notifications
    await this.setupFileWatcher();

    // Create notification marker file
    await this.createNotificationMarker();
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = undefined;
    }

    if (this.fileWatcher) {
      this.fileWatcher.close();
      this.fileWatcher = undefined;
    }

    console.error(`DeliveryService stopped for ${this.recipientId}`);
  }

  private async checkForNewMessages(): Promise<void> {
    try {
      const messages = await this.messageRouter.getMessages(this.recipientId, {
        unreadOnly: true,
        since: this.lastCheckedTimestamp,
      });

      this.lastCheckedTimestamp = Date.now();

      if (messages.length > 0) {
        await this.notifyNewMessages(messages);
      }
    } catch {
      // Silently handle errors, retry on next check
    }
  }

  private async setupFileWatcher(): Promise<void> {
    try {
      const sessionInfo = this.messageRouter.getSessionInfo();
      const messagesFilePath = `${sessionInfo.sessionDir}/messages.jsonl`;

      try {
        await fs.access(messagesFilePath);
      } catch {
        return;
      }

      this.fileWatcher = watch(messagesFilePath, async (eventType) => {
        if (eventType === "change") {
          await this.checkForNewMessages();
        }
      });
    } catch {
      // File watching is optional
    }
  }

  private async createNotificationMarker(): Promise<void> {
    try {
      const sessionInfo = this.messageRouter.getSessionInfo();
      const markerFile = `${sessionInfo.sessionDir}/notifications.json`;

      await fs.writeFile(
        markerFile,
        JSON.stringify({
          enabled: true,
          recipientId: this.recipientId,
          startTime: Date.now(),
        }),
        "utf-8",
      );
    } catch {
      // Marker file is optional
    }
  }

  private async updateNotificationMarker(): Promise<void> {
    try {
      const sessionInfo = this.messageRouter.getSessionInfo();
      const markerFile = `${sessionInfo.sessionDir}/notifications.json`;
      const stats = await this.messageRouter.getMessageStats(this.recipientId);

      await fs.writeFile(
        markerFile,
        JSON.stringify({
          enabled: true,
          recipientId: this.recipientId,
          unreadCount: stats.unread,
          totalCount: stats.total,
          lastUpdate: Date.now(),
          notificationCount: this.notificationCount,
        }),
        "utf-8",
      );
    } catch {
      // Marker file is optional
    }
  }

  private async notifyNewMessages(messages: Message[]): Promise<void> {
    this.notificationCount++;

    const notificationText = this.formatNotificationText(messages);

    // CHANNEL 1: stderr console output
    console.error(notificationText);

    // CHANNEL 2: MCP notification/message
    await this.sendMcpNotification(messages);

    // CHANNEL 3: Update notification marker file
    await this.updateNotificationMarker();
  }

  private formatNotificationText(messages: Message[]): string {
    let text = "";

    if (messages.length === 1) {
      const msg = messages[0];
      text += `\n${"=".repeat(60)}\n`;
      text += `📬 YOU'VE GOT MAIL! New message from ${msg.from}\n`;
      text += `${"=".repeat(60)}\n`;
      text += `Priority: ${msg.priority} | ${this.formatTimestamp(msg.timestamp)}\n\n`;

      const preview = msg.content.substring(0, 100);
      const truncated = msg.content.length > 100 ? "..." : "";
      text += `Preview: "${preview}${truncated}"\n\n`;
      text += `Use get_messages tool to read your messages.\n`;
      text += `${"=".repeat(60)}\n`;
    } else {
      text += `\n${"=".repeat(60)}\n`;
      text += `📬 YOU'VE GOT MAIL! ${messages.length} new messages\n`;
      text += `${"=".repeat(60)}\n`;

      const senders = [...new Set(messages.map((m) => m.from))];
      if (senders.length === 1) {
        text += `From: ${senders[0]}\n`;
      } else {
        text += `From: ${senders.join(", ")}\n`;
      }

      const highPriority = messages.filter((m) => m.priority === "high").length;
      if (highPriority > 0) {
        text += `⚠️  ${highPriority} high priority message(s)\n`;
      }

      text += `\nUse get_messages tool to read your messages.\n`;
      text += `${"=".repeat(60)}\n`;
    }

    return text;
  }

  private async sendMcpNotification(messages: Message[]): Promise<void> {
    if (!this.logger) {
      return;
    }

    try {
      if (messages.length === 1) {
        const msg = messages[0];
        await this.logger.notice(`📬 New message from ${msg.from}`, {
          from: msg.from,
          preview: msg.content.substring(0, 100),
          priority: msg.priority,
          messageId: msg.id,
        });
      } else {
        const senders = [...new Set(messages.map((m) => m.from))];
        await this.logger.notice(
          `📬 You have ${messages.length} new messages`,
          {
            count: messages.length,
            senders,
            messageIds: messages.map((m) => m.id),
          },
        );
      }
    } catch {
      // MCP notification failed, but we have stderr
    }
  }

  private formatTimestamp(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;

    if (diff < 60000) {
      return "just now";
    } else if (diff < 3600000) {
      const minutes = Math.floor(diff / 60000);
      return `${minutes} minute${minutes !== 1 ? "s" : ""} ago`;
    } else if (diff < 86400000) {
      const hours = Math.floor(diff / 3600000);
      return `${hours} hour${hours !== 1 ? "s" : ""} ago`;
    } else {
      const date = new Date(timestamp);
      return date.toLocaleString();
    }
  }

  getStats(): {
    isRunning: boolean;
    notificationCount: number;
    recipientId: string;
  } {
    return {
      isRunning: this.isRunning,
      notificationCount: this.notificationCount,
      recipientId: this.recipientId,
    };
  }
}
