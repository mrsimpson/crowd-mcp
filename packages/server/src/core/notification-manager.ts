import { promises as fs } from "fs";
import { spawn } from "child_process";
import { join } from "path";
import type { McpLogger } from "../mcp/mcp-logger.js";

export interface NotificationManager {
  /**
   * Send a notification to an agent that new messages are available
   */
  notifyAgent(agentId: string): Promise<void>;

  /**
   * Set up notification channel for an agent
   */
  setupAgentNotification(agentId: string, containerId: string): Promise<void>;

  /**
   * Clean up notification channel for an agent
   */
  cleanupAgentNotification(agentId: string): Promise<void>;

  /**
   * Get notification statistics
   */
  getStats(): {
    activeChannels: number;
    totalNotificationsSent: number;
    failedNotifications: number;
  };
}

/**
 * Named pipe-based notification manager for reliable agent notifications
 *
 * This replaces the unreliable SSE approach with named pipes (FIFOs)
 * that agents can read from to get immediate notifications of new messages.
 */
export class PipeNotificationManager implements NotificationManager {
  private pipes: Map<string, string> = new Map(); // agentId -> pipe path
  private notificationCount = 0;
  private failedCount = 0;

  constructor(
    private logger: McpLogger,
    private baseDir: string = "/tmp/crowd-notifications",
  ) {}

  async initialize(): Promise<void> {
    // Ensure base directory exists
    try {
      await fs.mkdir(this.baseDir, { recursive: true });
      await this.logger.info("Notification manager initialized", {
        baseDir: this.baseDir,
      });
    } catch (error) {
      await this.logger.error("Failed to create notification base directory", {
        baseDir: this.baseDir,
        error,
      });
      throw error;
    }
  }

  async setupAgentNotification(
    agentId: string,
    containerId: string,
  ): Promise<void> {
    const pipePath = join(this.baseDir, `${agentId}.pipe`);

    try {
      // Remove existing pipe if it exists
      try {
        await fs.unlink(pipePath);
      } catch {
        // Ignore if doesn't exist
      }

      // Create named pipe (FIFO)
      await this.createNamedPipe(pipePath);

      this.pipes.set(agentId, pipePath);

      await this.logger.info("Agent notification channel created", {
        agentId,
        containerId,
        pipePath,
      });
    } catch (error) {
      await this.logger.error("Failed to setup agent notification", {
        agentId,
        containerId,
        pipePath,
        error,
      });
      throw error;
    }
  }

  async notifyAgent(agentId: string): Promise<void> {
    const pipePath = this.pipes.get(agentId);
    if (!pipePath) {
      await this.logger.warning("No notification channel for agent", {
        agentId,
      });
      this.failedCount++;
      return;
    }

    try {
      // Check if pipe exists
      await fs.access(pipePath);

      // Send notification via pipe (non-blocking)
      const notification =
        JSON.stringify({
          type: "new_messages",
          timestamp: Date.now(),
          agentId,
        }) + "\n";

      // Use echo to write to pipe non-blocking
      await this.writeToNamedPipe(pipePath, notification);

      this.notificationCount++;

      await this.logger.debug("Notification sent to agent", {
        agentId,
        pipePath,
        notification: notification.trim(),
      });
    } catch (error) {
      this.failedCount++;
      await this.logger.warning("Failed to send notification to agent", {
        agentId,
        pipePath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async cleanupAgentNotification(agentId: string): Promise<void> {
    const pipePath = this.pipes.get(agentId);
    if (!pipePath) {
      return;
    }

    try {
      await fs.unlink(pipePath);
      this.pipes.delete(agentId);

      await this.logger.info("Agent notification channel cleaned up", {
        agentId,
        pipePath,
      });
    } catch (error) {
      await this.logger.warning("Failed to cleanup agent notification", {
        agentId,
        pipePath,
        error,
      });
    }
  }

  getStats() {
    return {
      activeChannels: this.pipes.size,
      totalNotificationsSent: this.notificationCount,
      failedNotifications: this.failedCount,
    };
  }

  /**
   * Create a named pipe using mkfifo
   */
  private async createNamedPipe(pipePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const mkfifo = spawn("mkfifo", [pipePath]);

      mkfifo.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`mkfifo exited with code ${code}`));
        }
      });

      mkfifo.on("error", reject);
    });
  }

  /**
   * Write to named pipe non-blocking
   */
  private async writeToNamedPipe(
    pipePath: string,
    data: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      // Use timeout to prevent hanging if no reader
      const timeout = setTimeout(() => {
        echo.kill();
        reject(new Error("Write to pipe timed out - no reader"));
      }, 1000);

      const echo = spawn("sh", [
        "-c",
        `echo '${data.replace(/'/g, "'\\''")}' > ${pipePath}`,
      ]);

      echo.on("close", (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`echo exited with code ${code}`));
        }
      });

      echo.on("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }
}

/**
 * Fallback notification manager that uses file system signals
 * for environments where named pipes are not available
 */
export class FileNotificationManager implements NotificationManager {
  private notificationDirs: Map<string, string> = new Map(); // agentId -> notification dir
  private notificationCount = 0;
  private failedCount = 0;

  constructor(
    private logger: McpLogger,
    private baseDir: string = "/tmp/crowd-file-notifications",
  ) {}

  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.baseDir, { recursive: true });
      await this.logger.info("File notification manager initialized", {
        baseDir: this.baseDir,
      });
    } catch (error) {
      await this.logger.error(
        "Failed to create file notification base directory",
        {
          baseDir: this.baseDir,
          error,
        },
      );
      throw error;
    }
  }

  async setupAgentNotification(
    agentId: string,
    containerId: string,
  ): Promise<void> {
    const notificationDir = join(this.baseDir, agentId);

    try {
      await fs.mkdir(notificationDir, { recursive: true });
      this.notificationDirs.set(agentId, notificationDir);

      await this.logger.info("Agent file notification channel created", {
        agentId,
        containerId,
        notificationDir,
      });
    } catch (error) {
      await this.logger.error("Failed to setup agent file notification", {
        agentId,
        containerId,
        notificationDir,
        error,
      });
      throw error;
    }
  }

  async notifyAgent(agentId: string): Promise<void> {
    const notificationDir = this.notificationDirs.get(agentId);
    if (!notificationDir) {
      await this.logger.warning("No file notification channel for agent", {
        agentId,
      });
      this.failedCount++;
      return;
    }

    try {
      const notificationFile = join(
        notificationDir,
        `message-${Date.now()}.signal`,
      );
      const notification = JSON.stringify({
        type: "new_messages",
        timestamp: Date.now(),
        agentId,
      });

      await fs.writeFile(notificationFile, notification, "utf8");

      this.notificationCount++;

      await this.logger.debug("File notification sent to agent", {
        agentId,
        notificationFile,
      });
    } catch (error) {
      this.failedCount++;
      await this.logger.warning("Failed to send file notification to agent", {
        agentId,
        notificationDir,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async cleanupAgentNotification(agentId: string): Promise<void> {
    const notificationDir = this.notificationDirs.get(agentId);
    if (!notificationDir) {
      return;
    }

    try {
      // Remove all notification files
      const files = await fs.readdir(notificationDir);
      await Promise.all(
        files.map((file) => fs.unlink(join(notificationDir, file))),
      );

      // Remove directory
      await fs.rmdir(notificationDir);

      this.notificationDirs.delete(agentId);

      await this.logger.info("Agent file notification channel cleaned up", {
        agentId,
        notificationDir,
      });
    } catch (error) {
      await this.logger.warning("Failed to cleanup agent file notification", {
        agentId,
        notificationDir,
        error,
      });
    }
  }

  getStats() {
    return {
      activeChannels: this.notificationDirs.size,
      totalNotificationsSent: this.notificationCount,
      failedNotifications: this.failedCount,
    };
  }
}
