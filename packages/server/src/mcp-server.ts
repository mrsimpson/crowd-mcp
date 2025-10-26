import type { ContainerManager } from "./docker/container-manager.js";
import type { AgentRegistry } from "@crowd-mcp/web-server";
import type { Agent } from "@crowd-mcp/shared";

export interface SpawnAgentResult {
  agentId: string;
  task: string;
  containerId: string;
  dashboardUrl: string;
}

export interface ListAgentsResult {
  agents: Agent[];
  count: number;
}

export interface StopAgentResult {
  success: boolean;
  agentId: string;
}

export class McpServer {
  private readonly dashboardUrl: string;

  constructor(
    private containerManager: ContainerManager,
    private registry: AgentRegistry,
    httpPort: number,
  ) {
    this.dashboardUrl = `http://localhost:${httpPort}`;
  }

  async handleSpawnAgent(task: string): Promise<SpawnAgentResult> {
    if (!task || task.trim() === "") {
      throw new Error("Task cannot be empty");
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

  async handleListAgents(): Promise<ListAgentsResult> {
    const agents = this.registry.listAgents();
    return {
      agents,
      count: agents.length,
    };
  }

  async handleStopAgent(agentId: string): Promise<StopAgentResult> {
    if (!agentId || agentId.trim() === "") {
      throw new Error("Agent ID cannot be empty");
    }

    await this.registry.stopAgent(agentId);

    return {
      success: true,
      agentId,
    };
  }
}
