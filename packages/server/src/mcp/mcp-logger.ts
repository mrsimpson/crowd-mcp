import type { Server } from "@modelcontextprotocol/sdk/server/index.js";

/**
 * MCP Log Levels (RFC 5424)
 */
export type LogLevel =
  | "debug"
  | "info"
  | "notice"
  | "warning"
  | "error"
  | "critical"
  | "alert"
  | "emergency";

/**
 * MCP Logger
 *
 * Implements standardized MCP logging protocol (notifications/message)
 * Logs are visible in MCP clients like Claude Desktop
 */
export class McpLogger {
  private minLevel: LogLevel = "info";
  private logLevelPriority: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    notice: 2,
    warning: 3,
    error: 4,
    critical: 5,
    alert: 6,
    emergency: 7,
  };

  constructor(
    private server: Server,
    private loggerName: string,
  ) {}

  /**
   * Set minimum log level
   */
  setLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  /**
   * Check if a log level should be logged
   */
  private shouldLog(level: LogLevel): boolean {
    return this.logLevelPriority[level] >= this.logLevelPriority[this.minLevel];
  }

  /**
   * Send log message via MCP notifications/message
   */
  private async log(
    level: LogLevel,
    message: string,
    data?: unknown,
  ): Promise<void> {
    if (!this.shouldLog(level)) {
      return;
    }

    // Also log to stderr for debugging
    const timestamp = new Date().toISOString();
    console.error(
      `[${timestamp}] [${level.toUpperCase()}] [${this.loggerName}] ${message}`,
    );
    if (data) {
      console.error(JSON.stringify(data, null, 2));
    }

    try {
      const logData: Record<string, unknown> = {
        message,
        timestamp,
      };
      if (data !== undefined && data !== null) {
        logData.details = data;
      }

      await this.server.notification({
        method: "notifications/message",
        params: {
          level,
          logger: this.loggerName,
          data: logData,
        },
      });
    } catch (error) {
      // If notification fails, still log to stderr
      console.error("Failed to send MCP log notification:", error);
    }
  }

  /**
   * Log debug message
   */
  async debug(message: string, data?: unknown): Promise<void> {
    await this.log("debug", message, data);
  }

  /**
   * Log info message
   */
  async info(message: string, data?: unknown): Promise<void> {
    await this.log("info", message, data);
  }

  /**
   * Log notice message
   */
  async notice(message: string, data?: unknown): Promise<void> {
    await this.log("notice", message, data);
  }

  /**
   * Log warning message
   */
  async warning(message: string, data?: unknown): Promise<void> {
    await this.log("warning", message, data);
  }

  /**
   * Log error message
   */
  async error(message: string, data?: unknown): Promise<void> {
    await this.log("error", message, data);
  }

  /**
   * Log critical message
   */
  async critical(message: string, data?: unknown): Promise<void> {
    await this.log("critical", message, data);
  }

  /**
   * Log alert message
   */
  async alert(message: string, data?: unknown): Promise<void> {
    await this.log("alert", message, data);
  }

  /**
   * Log emergency message
   */
  async emergency(message: string, data?: unknown): Promise<void> {
    await this.log("emergency", message, data);
  }
}
