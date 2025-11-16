import { ACPContainerClient } from "./acp-container-client.js";
import type { AcpMcpServer } from "../agent-config/acp-mcp-converter.js";
import { ACPLogger } from "./acp-logger.js";

interface MessageRouter {
  send(message: {
    from: string;
    to: string;
    content: string;
  }): Promise<unknown>;
}

interface EventEmitter {
  emit(event: string, data: unknown): void;
}

export class ACPClientManager {
  private clients = new Map<string, ACPContainerClient>();
  private logger: ACPLogger;

  constructor(
    private messageRouter?: MessageRouter,
    private eventEmitter?: EventEmitter,
  ) {
    // Initialize logger synchronously - we'll create it properly in initialize()
    this.logger = null as any; // Temporary until initialize() is called
  }

  async initialize(): Promise<void> {
    this.logger = await ACPLogger.create('ACPClientManager');
  }

  async createClient(
    agentId: string,
    containerId: string,
    mcpServers: AcpMcpServer[] = [],
  ): Promise<ACPContainerClient> {
    try {
      // Remove existing client if any
      await this.removeClient(agentId);

      const client = new ACPContainerClient(
        agentId,
        containerId,
        this.messageRouter,
        mcpServers,
        this.eventEmitter,
      );
      await client.initialize();
      this.clients.set(agentId, client);

      await this.logger.debug(
        `ACP client created successfully for agent ${agentId} with ${mcpServers.length} MCP servers`,
      );
      return client;
    } catch (error) {
      await this.logger.connectionError(error);
      throw error;
    }
  }

  hasClient(agentId: string): boolean {
    const client = this.clients.get(agentId);
    return client ? client.isHealthy() : false;
  }

  getClient(agentId: string): ACPContainerClient | undefined {
    const client = this.clients.get(agentId);
    return client && client.isHealthy() ? client : undefined;
  }

  async removeClient(agentId: string): Promise<void> {
    const client = this.clients.get(agentId);
    if (client) {
      try {
        await client.cleanup();
        await this.logger.debug(`ACP client cleaned up for agent ${agentId}`);
      } catch (error) {
        await this.logger.connectionError(error);
      } finally {
        this.clients.delete(agentId);
      }
    }
  }

  async forwardMessage(
    agentId: string,
    message: { content: string; from: string; timestamp: Date },
  ): Promise<void> {
    const client = this.clients.get(agentId);
    if (!client) {
      throw new Error(`No ACP client found for agent ${agentId}`);
    }

    if (!client.isHealthy()) {
      throw new Error(`ACP client for agent ${agentId} is not healthy`);
    }

    try {
      await client.sendPrompt(message);
    } catch (error) {
      await this.logger.connectionError(error);
      throw error;
    }
  }

  getHealthStatus(): { agentId: string; healthy: boolean }[] {
    return Array.from(this.clients.entries()).map(([agentId, client]) => ({
      agentId,
      healthy: client.isHealthy(),
    }));
  }

  async cleanup(): Promise<void> {
    const cleanupPromises = Array.from(this.clients.keys()).map((agentId) =>
      this.removeClient(agentId),
    );
    await Promise.all(cleanupPromises);
  }
}
