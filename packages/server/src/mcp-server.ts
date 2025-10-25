import type { ContainerManager } from './docker/container-manager.js';

export interface SpawnAgentResult {
  agentId: string;
  task: string;
  containerId: string;
}

export class McpServer {
  constructor(private containerManager: ContainerManager) {}

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

    return {
      agentId: agent.id,
      task: agent.task,
      containerId: agent.containerId,
    };
  }
}
