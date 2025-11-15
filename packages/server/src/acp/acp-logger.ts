import { FileLogger } from "../logging/file-logger.js";

export class ACPLogger {
  private logger: FileLogger;
  private agentId: string;

  constructor(agentId: string, logger: FileLogger) {
    this.agentId = agentId;
    this.logger = logger;
  }

  static async create(agentId: string): Promise<ACPLogger> {
    const logger = await FileLogger.create(`acp-${agentId}`);
    return new ACPLogger(agentId, logger);
  }

  async sessionCreated(containerId: string, mcpServers: any[]): Promise<void> {
    await this.logger.info("ACP session creation initiated", {
      agentId: this.agentId,
      containerId,
      mcpServerCount: mcpServers.length,
      mcpServers: mcpServers.map((s) => ({
        name: s.name,
        type: s.type || "stdio",
      })),
    });
  }

  async sessionRequest(request: any): Promise<void> {
    await this.logger.debug("ACP session request sent", {
      agentId: this.agentId,
      request,
    });
  }

  async sessionResponse(response: any): Promise<void> {
    await this.logger.debug("ACP session response received", {
      agentId: this.agentId,
      response,
    });
  }

  async messageForwarded(message: any, recipient: string): Promise<void> {
    await this.logger.debug("Message forwarded to agent", {
      agentId: this.agentId,
      recipient,
      messageType: message.type || "unknown",
      messageId: message.id,
    });
  }

  async connectionError(error: any): Promise<void> {
    await this.logger.error("ACP connection error", {
      agentId: this.agentId,
      error: error.message || error,
      stack: error.stack,
    });
  }

  async clientCreated(containerId: string): Promise<void> {
    await this.logger.info("ACP client created successfully", {
      agentId: this.agentId,
      containerId,
    });
  }

  async clientDestroyed(): Promise<void> {
    await this.logger.info("ACP client destroyed", {
      agentId: this.agentId,
    });
  }

  async debug(message: string, data?: any): Promise<void> {
    await this.logger.debug(message, {
      agentId: this.agentId,
      ...data,
    });
  }
}
