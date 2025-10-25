import { EventEmitter } from 'events';
import type Dockerode from 'dockerode';
import type { Agent } from '@crowd-mcp/shared';

export class AgentRegistry extends EventEmitter {
  private agents: Map<string, Agent> = new Map();

  constructor(private docker: Dockerode) {
    super();
  }

  async syncFromDocker(): Promise<void> {
    const containers = await this.docker.listContainers({
      all: true,
    });

    for (const container of containers) {
      const name = container.Names[0];
      if (!name || !name.startsWith('/agent-')) {
        continue;
      }

      // Extract agent ID from container name: /agent-123 → 123
      const agentId = name.replace('/agent-', '');

      const agent: Agent = {
        id: agentId,
        task: container.Labels?.['crowd-mcp.task'] || '',
        containerId: container.Id,
      };

      this.agents.set(agentId, agent);
    }
  }

  listAgents(): Agent[] {
    return Array.from(this.agents.values());
  }

  getAgent(id: string): Agent | undefined {
    return this.agents.get(id);
  }

  registerAgent(agent: Agent): void {
    this.agents.set(agent.id, agent);
    this.emit('agent:created', agent);
  }

  updateAgent(id: string, update: Partial<Agent>): void {
    const agent = this.agents.get(id);
    if (!agent) return;

    Object.assign(agent, update);
    this.emit('agent:updated', agent);
  }

  removeAgent(id: string): void {
    const agent = this.agents.get(id);
    if (!agent) return;

    this.agents.delete(id);
    this.emit('agent:removed', agent);
  }
}
