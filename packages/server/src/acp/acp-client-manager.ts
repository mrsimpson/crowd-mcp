import { ACPContainerClient } from './acp-container-client.js';

export class ACPClientManager {
  private clients = new Map<string, ACPContainerClient>();

  constructor(private messageRouter?: any) {}

  async createClient(agentId: string, containerId: string): Promise<ACPContainerClient> {
    try {
      // Remove existing client if any
      await this.removeClient(agentId);

      const client = new ACPContainerClient(agentId, containerId, this.messageRouter);
      await client.initialize();
      this.clients.set(agentId, client);
      
      console.log(`ACP client created successfully for agent ${agentId}`);
      return client;
    } catch (error) {
      console.error(`Failed to create ACP client for agent ${agentId}:`, error);
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
        console.log(`ACP client cleaned up for agent ${agentId}`);
      } catch (error) {
        console.error(`Error cleaning up ACP client for agent ${agentId}:`, error);
      } finally {
        this.clients.delete(agentId);
      }
    }
  }

  async forwardMessage(agentId: string, message: { content: string; from: string; timestamp: Date }): Promise<void> {
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
      console.error(`Failed to forward message to agent ${agentId} via ACP:`, error);
      throw error;
    }
  }

  getHealthStatus(): { agentId: string; healthy: boolean }[] {
    return Array.from(this.clients.entries()).map(([agentId, client]) => ({
      agentId,
      healthy: client.isHealthy()
    }));
  }

  async cleanup(): Promise<void> {
    const cleanupPromises = Array.from(this.clients.keys()).map(agentId => 
      this.removeClient(agentId)
    );
    await Promise.all(cleanupPromises);
  }
}
