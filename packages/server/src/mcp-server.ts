import type { ContainerManager } from "./docker/container-manager.js";
import type { AgentRegistry } from "@crowd-mcp/web-server";
import type { Agent } from "@crowd-mcp/shared";
import type { McpLogger } from "./mcp/mcp-logger.js";
import type { MessagingTools } from "./mcp/messaging-tools.js";
import { DEVELOPER_ID } from "@crowd-mcp/shared";

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
    private logger: McpLogger,
    private messagingTools: MessagingTools,
    httpPort: number,
  ) {
    this.dashboardUrl = `http://localhost:${httpPort}`;
  }

  async handleSpawnAgent(
    task: string,
    agentType?: string,
    repositoryOptions?: {
      repositoryUrl?: string;
      repositoryBranch?: string;
      repositoryTargetPath?: string;
    },
  ): Promise<SpawnAgentResult> {
    if (!task || task.trim() === "") {
      throw new Error("Task cannot be empty");
    }

    const agentId = `agent-${Date.now()}`;
    const workspace = process.cwd();

    await this.logger.info("Starting agent spawn", {
      agentId,
      agentType: agentType || "(default)",
      taskLength: task.length,
      taskPreview: task.substring(0, 100) + "...",
      workspace,
    });

    const spawnConfig: {
      agentId: string;
      task: string;
      workspace: string;
      agentType?: string;
      repositoryUrl?: string;
      repositoryBranch?: string;
      repositoryTargetPath?: string;
    } = {
      agentId,
      task,
      workspace,
    };

    // Only include agentType if it's provided
    if (agentType !== undefined) {
      spawnConfig.agentType = agentType;
    }

    // Add repository options if provided
    if (repositoryOptions?.repositoryUrl) {
      spawnConfig.repositoryUrl = repositoryOptions.repositoryUrl;
      spawnConfig.repositoryBranch = repositoryOptions.repositoryBranch;
      spawnConfig.repositoryTargetPath = repositoryOptions.repositoryTargetPath;

      await this.logger.info("Repository options provided for agent", {
        agentId,
        repositoryUrl: repositoryOptions.repositoryUrl,
        repositoryBranch: repositoryOptions.repositoryBranch || "main",
        repositoryTargetPath:
          repositoryOptions.repositoryTargetPath || "auto-generated",
      });
    }

    await this.logger.info("Creating agent container", { agentId });
    const agent = await this.containerManager.spawnAgent(spawnConfig);

    await this.logger.info("Agent container created", {
      agentId: agent.id,
      containerId: agent.containerId,
      status: agent.status,
    });

    // Register agent in the registry
    this.registry.registerAgent(agent);

    await this.logger.info("Agent registered and ready", {
      agentId: agent.id,
      containerId: agent.containerId,
      dashboardUrl: this.dashboardUrl,
    });

    // NEW APPROACH: Send task to agent's inbox via messaging system
    if (task && task.trim()) {
      await this.logger.info(
        "Sending task to agent inbox via messaging system",
        {
          agentId: agent.id,
          taskLength: task.length,
          taskPreview:
            task.substring(0, 100) + (task.length > 100 ? "..." : ""),
        },
      );

      try {
        const messageResult = await this.messagingTools.sendMessage({
          from: DEVELOPER_ID,
          to: agent.id,
          content: `**Initial Task Assignment:**

${task}

---

**📋 Instructions:**
Once you complete this task, please send a message to 'developer' using the send_message MCP tool to report your completion status and any results.

**Example completion message:**
\`\`\`
Task completed successfully! [Brief summary of what was accomplished]
\`\`\``,
          priority: "high",
        });

        await this.logger.info("Task successfully sent to agent inbox", {
          agentId: agent.id,
          messageId: messageResult.messageId,
        });
      } catch (error) {
        await this.logger.error("Failed to send task to agent inbox", {
          agentId: agent.id,
          error: {
            message: error instanceof Error ? error.message : String(error),
            name: error instanceof Error ? error.name : typeof error,
          },
        });
      }
    } else {
      await this.logger.info("No task to send to agent", { agentId: agent.id });
    }

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
