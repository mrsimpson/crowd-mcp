import { EventEmitter } from "events";
import type Dockerode from "dockerode";
import type { Agent } from "@crowd-mcp/shared";

export class AgentRegistry extends EventEmitter {
  private agents: Map<string, Agent> = new Map();

  constructor(private docker: Dockerode) {
    super();
  }

  async syncFromDocker(): Promise<void> {
    // Only list running containers (all: false is default, but explicit for clarity)
    const containers = await this.docker.listContainers({
      all: false,
    });

    // Get current agent IDs before sync
    const currentAgentIds = new Set(this.agents.keys());
    const syncedAgentIds = new Set<string>();

    for (const container of containers) {
      const name = container.Names[0];
      if (!name || !name.startsWith("/agent-")) {
        continue;
      }

      // Extract agent ID from container name: /agent-123 → 123
      const agentId = name.replace("/agent-", "");
      syncedAgentIds.add(agentId);

      const agent: Agent = {
        id: agentId,
        task: container.Labels?.["crowd-mcp.task"] || "",
        containerId: container.Id,
      };

      this.agents.set(agentId, agent);
    }

    // Remove agents whose containers are no longer running
    for (const agentId of currentAgentIds) {
      if (!syncedAgentIds.has(agentId)) {
        this.removeAgent(agentId);
      }
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
    this.emit("agent:created", agent);
  }

  updateAgent(id: string, update: Partial<Agent>): void {
    const agent = this.agents.get(id);
    if (!agent) return;

    Object.assign(agent, update);
    this.emit("agent:updated", agent);
  }

  removeAgent(id: string): void {
    const agent = this.agents.get(id);
    if (!agent) return;

    this.agents.delete(id);
    this.emit("agent:removed", agent);
  }

  async stopAgent(id: string): Promise<void> {
    const agent = this.agents.get(id);
    if (!agent) {
      throw new Error("Agent not found");
    }

    // Stop and remove the Docker container
    const container = this.docker.getContainer(agent.containerId);
    await container.stop();
    await container.remove();

    // Remove from registry
    this.removeAgent(id);
  }

  async getAgentLogs(id: string, tail?: number): Promise<string> {
    const agent = this.agents.get(id);
    if (!agent) {
      throw new Error("Agent not found");
    }

    const container = this.docker.getContainer(agent.containerId);

    const logStream = await container.logs({
      stdout: true,
      stderr: true,
      tail: tail || 0, // 0 means all logs
      timestamps: false,
    });

    return logStream.toString("utf-8");
  }

  async streamAgentLogs(
    id: string,
    tail?: number,
  ): Promise<NodeJS.ReadableStream> {
    const agent = this.agents.get(id);
    if (!agent) {
      throw new Error("Agent not found");
    }

    const container = this.docker.getContainer(agent.containerId);

    const logStream = await container.logs({
      stdout: true,
      stderr: true,
      follow: true, // Stream logs in real-time
      tail: tail || 100, // Default to last 100 lines
      timestamps: false,
    });

    return logStream;
  }
}
