import { FileLogger } from "./file-logger.js";

/**
 * Dedicated logger for the main MCP server component
 */
export class ServerLogger {
  private logger: FileLogger;

  constructor(logger: FileLogger) {
    this.logger = logger;
  }

  static async create(): Promise<ServerLogger> {
    const logger = await FileLogger.create('mcp-server');
    return new ServerLogger(logger);
  }

  async configurationValidated(): Promise<void> {
    await this.logger.info("OpenCode configuration validated successfully");
  }

  async configurationFailed(errors: string[]): Promise<void> {
    await this.logger.error("Server startup failed due to configuration errors", { errors });
  }

  async httpServerStarted(port: number): Promise<void> {
    await this.logger.info("HTTP server started successfully", {
      port,
      dashboard: `http://localhost:${port}`,
      apiEndpoint: `http://localhost:${port}/api/agents`,
      messagesApi: `http://localhost:${port}/api/messages`
    });
  }

  async httpServerFailed(port: number, error: string): Promise<void> {
    await this.logger.error("Failed to start HTTP server", { port, error });
  }

  async messagingSystemInitialized(): Promise<void> {
    await this.logger.info("Messaging system initialized");
  }

  async agentMcpServerFailed(port: number, error: string): Promise<void> {
    await this.logger.error("Failed to start Agent MCP Server", { port, error });
  }

  async serverStarted(httpPort: number, agentMcpPort: number, sessionId: string): Promise<void> {
    await this.logger.info("crowd-mcp server started", {
      httpPort,
      agentMcpPort,
      sessionId
    });
  }

  async registrySyncError(error: any): Promise<void> {
    await this.logger.error("Error during registry sync", { error });
  }

  async agentTypesLoadWarning(error: any): Promise<void> {
    await this.logger.warn("Could not load agent types", { error });
  }
}
