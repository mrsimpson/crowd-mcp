import { promises as fs } from "fs";
import { join } from "path";
import type { Message } from "@crowd-mcp/shared";

/**
 * DeveloperNotificationFile
 *
 * Creates a simple notification file that external processes (like the CLI)
 * can watch using file system events (inotify, FSEvents, etc.).
 *
 * File format: One notification per line (JSONL)
 * Location: .crowd/sessions/{sessionId}/developer-notifications.jsonl
 *
 * Each line contains:
 * {
 *   "timestamp": 1234567890,
 *   "messageId": "abc-123",
 *   "from": "agent-123",
 *   "priority": "high",
 *   "preview": "Task completed..."
 * }
 *
 * Usage for CLI:
 * 1. Watch the file with fs.watch() or chokidar
 * 2. On file change, read new lines
 * 3. Display notification to user
 * 4. Call get_messages() tool to fetch full content
 */
export class DeveloperNotificationFile {
  private notificationFile: string;

  constructor(sessionDir: string) {
    this.notificationFile = join(sessionDir, "developer-notifications.jsonl");
  }

  /**
   * Append a notification for a new developer message
   */
  async notify(message: Message): Promise<void> {
    const notification = {
      timestamp: message.timestamp,
      messageId: message.id,
      from: message.from,
      priority: message.priority,
      preview:
        message.content.length > 150
          ? message.content.substring(0, 150) + "..."
          : message.content,
    };

    const line = JSON.stringify(notification) + "\n";

    try {
      await fs.appendFile(this.notificationFile, line, "utf-8");
    } catch (error) {
      console.error("Failed to write developer notification:", error);
    }
  }

  /**
   * Get the notification file path for external watchers
   */
  getFilePath(): string {
    return this.notificationFile;
  }

  /**
   * Clear all notifications (optional maintenance)
   */
  async clear(): Promise<void> {
    try {
      await fs.writeFile(this.notificationFile, "", "utf-8");
    } catch (error) {
      console.error("Failed to clear developer notifications:", error);
    }
  }
}
