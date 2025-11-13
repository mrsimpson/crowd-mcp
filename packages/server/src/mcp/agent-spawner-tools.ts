import type { ContainerManager } from "../docker/container-manager.js";
import type { AgentRegistry } from "@crowd-mcp/web-server";
import type { Agent } from "@crowd-mcp/shared";
import type { SpawnTracker } from "../core/spawn-tracker.js";
import type { MessagingTools } from "./messaging-tools.js";

export interface SpawnAgentParams {
  task: string;
  agentType?: string;
}

export interface SpawnAgentResult {
  success: boolean;
  agentId: string;
  task: string;
  containerId: string;
  remainingSpawns: number;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ListSpawnedAgentsParams {
  // No params needed - implicitly uses the calling agent's ID
}

export interface ListSpawnedAgentsResult {
  success: boolean;
  agents: Agent[];
  count: number;
  maxSpawns: number;
  remainingSpawns: number;
}

export interface StopSpawnedAgentParams {
  agentId: string;
}

export interface StopSpawnedAgentResult {
  success: boolean;
  agentId: string;
}

export interface GetSpawnLimitsResult {
  success: boolean;
  maxSpawns: number;
  currentSpawns: number;
  remainingSpawns: number;
}

/**
 * AgentSpawnerTools provides MCP tools for agents to spawn and manage other agents
 *
 * This is an opt-in service that must be explicitly configured in an agent's YAML file.
 * It allows agents to delegate work by spawning sub-agents, with configurable limits
 * to prevent runaway agent creation.
 */
export class AgentSpawnerTools {
  constructor(
    private containerManager: ContainerManager,
    private agentRegistry: AgentRegistry,
    private spawnTracker: SpawnTracker,
    private messagingTools: MessagingTools,
  ) {}

  /**
   * Spawn a new agent with a specific task
   *
   * The spawned agent will be tracked as a child of the calling agent.
   * Enforces max spawn limits per agent.
   */
  async spawnAgent(
    params: SpawnAgentParams,
    callingAgentId: string,
  ): Promise<SpawnAgentResult> {
    const { task, agentType } = params;

    if (!task || task.trim() === "") {
      throw new Error("Task cannot be empty");
    }

    // Validate calling agent exists
    const callingAgent = this.agentRegistry.getAgent(callingAgentId);
    if (!callingAgent) {
      throw new Error(`Agent ${callingAgentId} not found`);
    }

    // Check spawn limits
    if (!this.spawnTracker.canSpawn(callingAgentId)) {
      const maxSpawns = this.spawnTracker.getMaxSpawnsPerAgent();
      throw new Error(
        `Spawn limit reached. Maximum ${maxSpawns} agents can be spawned per agent. ` +
          `Consider stopping an existing spawned agent before creating a new one.`,
      );
    }

    // Generate new agent ID
    const agentId = `agent-${Date.now()}`;
    const workspace = process.cwd();

    // Spawn the agent
    const spawnConfig: {
      agentId: string;
      task: string;
      workspace: string;
      agentType?: string;
    } = {
      agentId,
      task,
      workspace,
    };

    if (agentType !== undefined) {
      spawnConfig.agentType = agentType;
    }

    const agent = await this.containerManager.spawnAgent(spawnConfig);

    // Register the agent
    this.agentRegistry.registerAgent(agent);

    // Record the spawn relationship
    this.spawnTracker.recordSpawn(callingAgentId, agentId, task);

    // Send task to the new agent's inbox via messaging system
    if (task && task.trim()) {
      try {
        await this.messagingTools.sendMessage({
          from: callingAgentId,
          to: agent.id,
          content: `**Task Assignment from ${callingAgentId}:**

${task}

---

**📋 Instructions:**
Once you complete this task, please send a message to '${callingAgentId}' using the send_message MCP tool to report your completion status and any results.

**Example completion message:**
\`\`\`
Task completed successfully! [Brief summary of what was accomplished]
\`\`\``,
          priority: "high",
        });
      } catch (error) {
        // Log error but don't fail the spawn
        console.error(
          `Failed to send task to spawned agent ${agentId}:`,
          error,
        );
      }
    }

    const remainingSpawns =
      this.spawnTracker.getRemainingSpawns(callingAgentId);

    return {
      success: true,
      agentId: agent.id,
      task: agent.task,
      containerId: agent.containerId,
      remainingSpawns,
    };
  }

  /**
   * List all agents spawned by the calling agent
   */
  async listSpawnedAgents(
    callingAgentId: string,
  ): Promise<ListSpawnedAgentsResult> {
    // Validate calling agent exists
    const callingAgent = this.agentRegistry.getAgent(callingAgentId);
    if (!callingAgent) {
      throw new Error(`Agent ${callingAgentId} not found`);
    }

    // Get spawn records for this agent
    const spawnRecords = this.spawnTracker.getSpawnedAgents(callingAgentId);

    // Get full agent details for each spawned agent
    const agents = spawnRecords
      .map((record) => this.agentRegistry.getAgent(record.childAgentId))
      .filter((agent): agent is Agent => agent !== null);

    const maxSpawns = this.spawnTracker.getMaxSpawnsPerAgent();
    const remainingSpawns =
      this.spawnTracker.getRemainingSpawns(callingAgentId);

    return {
      success: true,
      agents,
      count: agents.length,
      maxSpawns,
      remainingSpawns,
    };
  }

  /**
   * Stop an agent that was spawned by the calling agent
   *
   * Only allows stopping agents that were directly spawned by the caller.
   */
  async stopSpawnedAgent(
    params: StopSpawnedAgentParams,
    callingAgentId: string,
  ): Promise<StopSpawnedAgentResult> {
    const { agentId } = params;

    // Validate calling agent exists
    const callingAgent = this.agentRegistry.getAgent(callingAgentId);
    if (!callingAgent) {
      throw new Error(`Agent ${callingAgentId} not found`);
    }

    // Validate target agent exists
    const targetAgent = this.agentRegistry.getAgent(agentId);
    if (!targetAgent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    // Verify the calling agent spawned this agent
    const parent = this.spawnTracker.getParent(agentId);
    if (parent !== callingAgentId) {
      throw new Error(
        `Permission denied. Agent ${agentId} was not spawned by ${callingAgentId}. ` +
          `You can only stop agents that you directly spawned.`,
      );
    }

    // Stop the agent
    await this.containerManager.stopAgent(agentId);

    // Remove spawn record
    this.spawnTracker.removeSpawn(agentId);

    return {
      success: true,
      agentId,
    };
  }

  /**
   * Get spawn limits and current usage for the calling agent
   */
  async getSpawnLimits(callingAgentId: string): Promise<GetSpawnLimitsResult> {
    // Validate calling agent exists
    const callingAgent = this.agentRegistry.getAgent(callingAgentId);
    if (!callingAgent) {
      throw new Error(`Agent ${callingAgentId} not found`);
    }

    const maxSpawns = this.spawnTracker.getMaxSpawnsPerAgent();
    const currentSpawns = this.spawnTracker.getSpawnCount(callingAgentId);
    const remainingSpawns =
      this.spawnTracker.getRemainingSpawns(callingAgentId);

    return {
      success: true,
      maxSpawns,
      currentSpawns,
      remainingSpawns,
    };
  }

  /**
   * Get MCP tool definitions for Agent Interface
   *
   * These tools are only available to agents that have the agent-spawner
   * MCP server configured in their YAML definition.
   */
  getAgentToolDefinitions() {
    return [
      {
        name: "spawn_agent",
        description:
          "Spawn a new agent to handle a specific task. Use this to delegate work to a sub-agent. " +
          "The spawned agent will work independently and should report back to you when complete. " +
          "Note: There is a limit on how many agents you can spawn concurrently.",
        inputSchema: {
          type: "object",
          properties: {
            task: {
              type: "string",
              description:
                "The task for the new agent to complete. Be specific and clear about what you need done.",
            },
            agentType: {
              type: "string",
              description:
                'Optional agent type/configuration to use (e.g., "coder", "reviewer", "architect"). ' +
                "If not specified, a default agent will be spawned.",
            },
          },
          required: ["task"],
        },
      },
      {
        name: "list_spawned_agents",
        description:
          "List all agents that you have spawned. Shows their current status and tasks. " +
          "Use this to check on the progress of your sub-agents.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "stop_spawned_agent",
        description:
          "Stop and remove an agent that you spawned. Use this when a sub-agent has completed its task " +
          "or if you need to free up spawn capacity. You can only stop agents that you directly spawned.",
        inputSchema: {
          type: "object",
          properties: {
            agentId: {
              type: "string",
              description:
                "The ID of the agent to stop (must be an agent you spawned)",
            },
          },
          required: ["agentId"],
        },
      },
      {
        name: "get_spawn_limits",
        description:
          "Check your spawn limits and current usage. Shows how many agents you can spawn, " +
          "how many you've currently spawned, and how many more you can create.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
    ];
  }
}
