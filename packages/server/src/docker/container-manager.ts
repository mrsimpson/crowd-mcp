import type Dockerode from "dockerode";
import type { Agent } from "@crowd-mcp/shared";
import { EnvLoader } from "../config/index.js";
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
      `AGENT_TYPE=${config.agentType || "default"}`, // Pass agent name for --agent flag
      ...envVars,
    ];

    // Always generate agent configuration (messaging MCP server is always included)
    let configJson: string;

    if (config.agentType) {
      // Use agent-specific configuration from .crowd/agents/{agentType}.yaml
      const result = await this.configGenerator.generateJson(
        config.agentType,
        config.workspace,
        {
          agentId: config.agentId,
          agentMcpPort: this.agentMcpPort,
        },
      );
      configJson = result.configJson;
    } else {
      // No agentType specified - generate minimal default config
      // This ensures messaging MCP server is always configured
      const defaultConfig = {
        $schema: "https://opencode.ai/config.json",
        mcp: {
          messaging: {
            type: "remote",
            url: agentMcpUrl,
          },
        },
        agent: {
          default: {
            prompt: "You are a helpful AI coding assistant.",
            mode: "all",
          },
        },
      };
      configJson = JSON.stringify(defaultConfig);
    }

    // Base64 encode the config to safely pass through shell environment
    // This avoids issues with newlines and special characters
    const configBase64 = Buffer.from(configJson).toString("base64");

    // Add config as base64-encoded environment variable (always provided now)
    containerEnv.push(`AGENT_CONFIG_BASE64=${configBase64}`);

    // Build volume binds - only workspace (no config mount needed)
    const binds = [`${config.workspace}:/workspace:rw`];

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
      agentType: config.agentType,
      workspace: config.workspace,
    };
  }
}
