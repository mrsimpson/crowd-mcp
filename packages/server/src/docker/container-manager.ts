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
    // TODO: Read CLI selection from .crowd/config.yaml instead of hard-coding OpenCodeAdapter
    // When supporting multiple CLIs (Aider, Cursor, etc.), implement:
    // 1. Global config loader for .crowd/config.yaml
    // 2. CLI adapter factory/registry based on config.cli value
    // 3. Fallback to OpenCode if no config exists
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

    // Handle agent-specific configuration
    if (config.agentType) {
      // Generate agent-specific config as JSON string
      const result = await this.configGenerator.generateJson(
        config.agentType,
        config.workspace,
        {
          agentId: config.agentId,
          agentMcpPort: this.agentMcpPort,
        },
      );

      // Add config as environment variable
      containerEnv.push(`AGENT_CONFIG=${result.configJson}`);
    }

    // Build volume binds
    const binds = [`${config.workspace}:/workspace:rw`];

    // Legacy mode: mount shared config directory if no agentType
    if (!config.agentType) {
      const configDir = join(config.workspace, ".crowd/opencode");
      binds.push(`${configDir}:/root/.config/opencode:ro`);
    }

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
