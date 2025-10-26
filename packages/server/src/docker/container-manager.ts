import type Dockerode from 'dockerode';
import type { Agent } from '@crowd-mcp/shared';

export interface SpawnAgentConfig {
  agentId: string;
  task: string;
  workspace: string;
}

export class ContainerManager {
  constructor(private docker: Dockerode) {}

  async spawnAgent(config: SpawnAgentConfig): Promise<Agent> {
    const container = await this.docker.createContainer({
      name: `agent-${config.agentId}`,
      Image: 'crowd-mcp-agent:latest',
      Env: [
        `AGENT_ID=${config.agentId}`,
        `TASK=${config.task}`,
      ],
      HostConfig: {
        Binds: [`${config.workspace}:/workspace:rw`],
      },
      Tty: true,
      OpenStdin: true,
    });

    await container.start();

    return {
      id: config.agentId,
      task: config.task,
      containerId: container.id || '',
    };
  }
}
