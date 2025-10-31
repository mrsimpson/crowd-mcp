/**
 * SpawningTools
 *
 * Provides MCP tools for agents to spawn child agents.
 * Enforces spawning limits configured in agent definitions.
 */

import type { ContainerManager } from "../docker/container-manager.js";
import type { AgentRegistry } from "@crowd-mcp/web-server";
import type { MessageRouter } from "../core/message-router-jsonl.js";
import type { AgentDefinition } from "../agent-config/types.js";
import { SpawnTracker } from "../core/spawn-tracker.js";

/**
 * Parameters for spawning a new agent
 */
export interface SpawnAgentParams {
  parentAgentId: string;
  task: string;
  agentType?: string;
  workspace?: string;
}

/**
 * Result of spawning an agent
 */
export interface SpawnAgentResult {
  success: boolean;
  agentId: string;
  containerId: string;
  task: string;
  remainingSpawns: number;
  message?: string;
}

/**
 * Parameters for getting spawn status
 */
export interface GetSpawnStatusParams {
  agentId: string;
}

/**
 * Result of getting spawn status
 */
export interface GetSpawnStatusResult {
  canSpawn: boolean;
  spawned: number;
  maxSpawns: number;
  remainingSpawns: number;
}

/**
 * SpawningTools class - manages agent spawning capabilities
 */
export class SpawningTools {
  constructor(
    private containerManager: ContainerManager,
    private agentRegistry: AgentRegistry,
    private messageRouter: MessageRouter,
    private spawnTracker: SpawnTracker,
    private getAgentConfig: (agentId: string) => Promise<AgentDefinition>,
  ) {}

  /**
   * Spawn a new agent as a child of the current agent
   */
  async spawnAgent(params: SpawnAgentParams): Promise<SpawnAgentResult> {
    const { parentAgentId, task, agentType, workspace } = params;

    // Get parent agent's configuration to check spawning permissions
    const parentConfig = await this.getAgentConfig(parentAgentId);

    // Check if spawning is enabled for this agent
    if (!parentConfig.spawning || !parentConfig.spawning.enabled) {
      throw new Error(`Agent ${parentAgentId} is not allowed to spawn agents`);
    }

    const { maxSpawns } = parentConfig.spawning;

    // Check if spawn limit has been reached
    if (!this.spawnTracker.canSpawn(parentAgentId, maxSpawns)) {
      const currentCount = this.spawnTracker.getSpawnCount(parentAgentId);
      throw new Error(
        `Agent ${parentAgentId} has reached spawn limit (${currentCount}/${maxSpawns} spawned)`,
      );
    }

    // Generate unique agent ID
    const childAgentId = `agent-${Date.now()}`;

    // Use workspace from params or default to process.cwd()
    const agentWorkspace = workspace || process.cwd();

    // Spawn the container
    const spawnConfig: {
      agentId: string;
      task: string;
      workspace: string;
      agentType?: string;
    } = {
      agentId: childAgentId,
      task,
      workspace: agentWorkspace,
    };

    // Only include agentType if provided
    if (agentType !== undefined) {
      spawnConfig.agentType = agentType;
    }

    const agent = await this.containerManager.spawnAgent(spawnConfig);

    // Register agent in the registry
    this.agentRegistry.registerAgent(agent);

    // Record the spawn in the tracker
    this.spawnTracker.recordSpawn(parentAgentId, agent.id);

    // Send task to agent via messaging system
    await this.messageRouter.send({
      from: parentAgentId,
      to: agent.id, // Use the actual agent ID from the spawned agent
      content: `**Task from Parent Agent (${parentAgentId}):**

${task}

---

**📋 Instructions:**
Once you complete this task, please send a message to '${parentAgentId}' using the send_message MCP tool to report your completion status and any results.

**Example completion message:**
\`\`\`
Task completed successfully! [Brief summary of what was accomplished]
\`\`\``,
      priority: "high",
    });

    // Calculate remaining spawns
    const remainingSpawns = this.spawnTracker.getRemainingSpawns(
      parentAgentId,
      maxSpawns,
    );

    return {
      success: true,
      agentId: agent.id,
      containerId: agent.containerId,
      task: agent.task,
      remainingSpawns,
      message: `Agent ${agent.id} spawned successfully. You have ${remainingSpawns} spawns remaining.`,
    };
  }

  /**
   * Get spawn status for an agent
   */
  async getSpawnStatus(
    params: GetSpawnStatusParams,
  ): Promise<GetSpawnStatusResult> {
    const { agentId } = params;

    // Get agent's configuration
    const config = await this.getAgentConfig(agentId);

    // Check if spawning is configured and enabled
    const spawningEnabled = config.spawning?.enabled || false;
    const maxSpawns = config.spawning?.maxSpawns || 0;
    const spawned = this.spawnTracker.getSpawnCount(agentId);
    const remainingSpawns = this.spawnTracker.getRemainingSpawns(
      agentId,
      maxSpawns,
    );
    const canSpawn =
      spawningEnabled && this.spawnTracker.canSpawn(agentId, maxSpawns);

    return {
      canSpawn,
      spawned,
      maxSpawns,
      remainingSpawns,
    };
  }

  /**
   * Get MCP tool definitions for spawning
   */
  getToolDefinitions() {
    return [
      {
        name: "spawn_agent",
        description:
          "Spawn a new agent to work on a specific task. The spawned agent will be a child of the current agent and will communicate via messaging. Use this when you need parallel execution or delegation of subtasks.",
        inputSchema: {
          type: "object",
          properties: {
            task: {
              type: "string",
              description:
                "The task for the spawned agent to perform. Be clear and specific about what you want the agent to accomplish.",
            },
            agentType: {
              type: "string",
              description:
                "Optional: The type of agent to spawn (corresponds to .crowd/agents/{agentType}.yaml). If not specified, a default agent will be spawned.",
            },
            workspace: {
              type: "string",
              description:
                "Optional: The workspace directory for the agent. Defaults to the current workspace.",
            },
          },
          required: ["task"],
        },
      },
      {
        name: "get_spawn_status",
        description:
          "Get information about your spawning status, including how many agents you've spawned and how many you can still spawn.",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
      },
    ];
  }
}
