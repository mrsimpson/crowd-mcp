import { FileLogger } from "./file-logger.js";
import type { Message } from "@crowd-mcp/shared";

export class MessagingLogger {
  private logger: FileLogger;

  constructor(logger: FileLogger) {
    this.logger = logger;
  }

  static async create(): Promise<MessagingLogger> {
    const logger = await FileLogger.create("messaging");
    return new MessagingLogger(logger);
  }

  async toolCallReceived(
    agentId: string,
    toolName: string,
    args: any,
  ): Promise<void> {
    await this.logger.info("Messaging tool called", {
      agentId,
      toolName,
      args: this.sanitizeArgs(args),
    });
  }

  async toolCallResult(
    agentId: string,
    toolName: string,
    success: boolean,
    result?: any,
    error?: any,
  ): Promise<void> {
    await this.logger.info("Messaging tool result", {
      agentId,
      toolName,
      success,
      result: success ? this.sanitizeResult(result) : undefined,
      error: error ? error.message || error : undefined,
    });
  }

  async messageSent(message: Message, recipientCount?: number): Promise<void> {
    await this.logger.info("Message sent", {
      messageId: message.id,
      from: message.from,
      to: message.to,
      contentLength: message.content.length,
      contentPreview:
        message.content.substring(0, 100) +
        (message.content.length > 100 ? "..." : ""),
      priority: message.priority,
      timestamp: message.timestamp,
      recipientCount,
    });
  }

  async messageRetrieved(
    participantId: string,
    messageCount: number,
    unreadCount: number,
    filters?: any,
  ): Promise<void> {
    await this.logger.debug("Messages retrieved", {
      participantId,
      messageCount,
      unreadCount,
      filters,
    });
  }

  async messagesMarkedRead(
    messageIds: string[],
    participantId?: string,
  ): Promise<void> {
    await this.logger.debug("Messages marked as read", {
      participantId,
      messageCount: messageIds.length,
      messageIds: messageIds.slice(0, 5), // Log first 5 IDs to avoid spam
    });
  }

  async participantRegistered(participantId: string): Promise<void> {
    await this.logger.info("Participant registered", {
      participantId,
    });
  }

  async participantUnregistered(participantId: string): Promise<void> {
    await this.logger.info("Participant unregistered", {
      participantId,
    });
  }

  async agentDiscovery(
    requesterId: string,
    filters: any,
    resultCount: number,
  ): Promise<void> {
    await this.logger.debug("Agent discovery request", {
      requesterId,
      filters,
      resultCount,
    });
  }

  async messageRouterEvent(event: string, data: any): Promise<void> {
    await this.logger.debug("Message router event", {
      event,
      data: this.sanitizeEventData(data),
    });
  }

  async error(message: string, error: any, context?: any): Promise<void> {
    await this.logger.error(message, {
      error: error.message || error,
      stack: error.stack,
      ...context,
    });
  }

  async debug(message: string, data?: any): Promise<void> {
    await this.logger.debug(message, data);
  }

  private sanitizeArgs(args: any): any {
    if (!args) return args;

    const sanitized = { ...args };

    // Truncate long content
    if (
      sanitized.content &&
      typeof sanitized.content === "string" &&
      sanitized.content.length > 200
    ) {
      sanitized.content = sanitized.content.substring(0, 200) + "...";
    }

    return sanitized;
  }

  private sanitizeResult(result: any): any {
    if (!result) return result;

    const sanitized = { ...result };

    // For message arrays, limit and sanitize
    if (sanitized.messages && Array.isArray(sanitized.messages)) {
      sanitized.messages = sanitized.messages.slice(0, 3).map((msg: any) => ({
        id: msg.id,
        from: msg.from,
        to: msg.to,
        contentLength: msg.content?.length || 0,
        timestamp: msg.timestamp,
      }));
      if (result.messages.length > 3) {
        sanitized.messages.push({
          truncated: `... and ${result.messages.length - 3} more`,
        });
      }
    }

    return sanitized;
  }

  private sanitizeEventData(data: any): any {
    if (!data) return data;

    const sanitized = { ...data };

    // Sanitize message content in events
    if (sanitized.message && sanitized.message.content) {
      sanitized.message = {
        ...sanitized.message,
        contentLength: sanitized.message.content.length,
        contentPreview: sanitized.message.content.substring(0, 50) + "...",
      };
      delete sanitized.message.content;
    }

    return sanitized;
  }
}
