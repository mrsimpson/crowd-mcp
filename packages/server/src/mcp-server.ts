import type { ContainerManager } from './docker/container-manager.js';
import type { AgentRegistry } from '@crowd-mcp/web-server';

export interface SpawnAgentResult {
  agentId: string;
  task: string;
  containerId: string;
  dashboardUrl: string;
}

export class McpServer {
  private readonly dashboardUrl: string;

  constructor(
    private containerManager: ContainerManager,
    private registry: AgentRegistry,
    httpPort: number
  ) {
    this.dashboardUrl = `http://localhost:${httpPort}`;
  }

  async handleSpawnAgent(task: string): Promise<SpawnAgentResult> {
    if (!task || task.trim() === '') {
      throw new Error('Task cannot be empty');
    }

    const agentId = `agent-${Date.now()}`;
    const workspace = process.cwd();

    const agent = await this.containerManager.spawnAgent({
      agentId,
      task,
      workspace,
    });

    // Register agent in the registry
    this.registry.registerAgent(agent);

    return {
      agentId: agent.id,
      task: agent.task,
      containerId: agent.containerId,
      dashboardUrl: this.dashboardUrl,
    };
  }
}
