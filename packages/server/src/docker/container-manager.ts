import type Dockerode from "dockerode";
import type { Agent } from "@crowd-mcp/shared";
import { EnvLoader } from "../config/index.js";
import { join } from "path";
import { AgentDefinitionLoader } from "../agent-config/agent-definition-loader.js";
import { OpenCodeAdapter } from "../agent-config/opencode-adapter.js";
import { ConfigGenerator } from "../agent-config/config-generator.js";

export interface SpawnAgentConfig {
  agentId: string;
  task: string;
  workspace: string;
  agentType?: string;
}

export class ContainerManager {
  private envLoader: EnvLoader;
  private agentMcpPort: number;
  private configGenerator: ConfigGenerator;

  constructor(
    private docker: Dockerode,
    agentMcpPort: number = 3100,
  ) {
    this.envLoader = new EnvLoader();
    this.agentMcpPort = agentMcpPort;

    // Initialize agent configuration components
    const loader = new AgentDefinitionLoader();
    const adapter = new OpenCodeAdapter();
    this.configGenerator = new ConfigGenerator(loader, adapter);
  }

  async spawnAgent(config: SpawnAgentConfig): Promise<Agent> {
    // Load environment variables from .crowd/opencode/.env and .env.local
    const envVars = this.envLoader.loadEnvVars(config.workspace);

    // Build Agent MCP Server URL for container
    const agentMcpUrl = `http://host.docker.internal:${this.agentMcpPort}/sse?agentId=${config.agentId}`;

    // Build container environment variables
    const containerEnv = [
      `AGENT_ID=${config.agentId}`,
      `TASK=${config.task}`,
      `AGENT_MCP_URL=${agentMcpUrl}`,
      ...envVars,
    ];

    // Determine config directory path
    let configDir: string;
    if (config.agentType) {
      // Generate agent-specific config from agent definition
      await this.configGenerator.generate(config.agentType, config.workspace, {
        agentId: config.agentId,
        agentMcpPort: this.agentMcpPort,
      });

      // Use runtime config path for this specific agent instance
      configDir = join(
        config.workspace,
        ".crowd/runtime/agents",
        config.agentId,
      );
    } else {
      // Legacy mode: use shared opencode config directory
      configDir = join(config.workspace, ".crowd/opencode");
    }

    // Build volume binds
    const binds = [
      `${config.workspace}:/workspace:rw`,
      `${configDir}:/root/.config/opencode:ro`, // Mount config dir as read-only
    ];

    const container = await this.docker.createContainer({
      name: `agent-${config.agentId}`,
      Image: "crowd-mcp-agent:latest",
      Env: containerEnv,
      HostConfig: {
        Binds: binds,
      },
      // Tty: true required for interactive terminal tools like OpenCode
      // This produces a raw stream (not multiplexed)
      Tty: true,
      OpenStdin: true,
    });

    await container.start();

    return {
      id: config.agentId,
      task: config.task,
      containerId: container.id || "",
    };
  }
}
