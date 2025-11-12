import type Dockerode from "dockerode";
import type { Agent } from "@crowd-mcp/shared";
import { EnvLoader } from "../config/index.js";
import { AgentDefinitionLoader } from "../agent-config/agent-definition-loader.js";
import { ConfigGenerator } from "../agent-config/config-generator.js";
import type { AgentMcpServer } from "../mcp/agent-mcp-server.js";

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
    private agentMcpServer?: AgentMcpServer,
    agentMcpPort: number = 3100,
  ) {
    this.envLoader = new EnvLoader();
    this.agentMcpPort = agentMcpPort;

    // Initialize agent configuration components
    const loader = new AgentDefinitionLoader();
    this.configGenerator = new ConfigGenerator(loader);
  }

  async spawnAgent(config: SpawnAgentConfig): Promise<Agent> {
    // Load environment variables from .crowd/opencode/.env and .env.local
    const envVars = this.envLoader.loadEnvVars(config.workspace);

    // Build Agent MCP Server URL for container
    const agentMcpUrl = `http://host.docker.internal:${this.agentMcpPort}/mcp`;

    // Build container environment variables
    const containerEnv = [
      `AGENT_ID=${config.agentId}`,
      `TASK=${config.task}`,
      `AGENT_MCP_URL=${agentMcpUrl}`,
      `AGENT_TYPE=${config.agentType || "default"}`, // Pass agent name for --agent flag
      ...envVars,
    ];

    // Generate ACP MCP servers (messaging server always included)
    const acpResult = await this.configGenerator.generateAcpMcpServers(
      config.agentType,
      config.workspace,
      {
        agentId: config.agentId,
        agentMcpPort: this.agentMcpPort,
      },
    );

    console.log(`📋 Generated ${acpResult.mcpServers.length} MCP servers for agent ${config.agentId}`);

    // No longer need AGENT_CONFIG_BASE64 - ACP handles configuration via session creation

    // Build volume binds - only workspace (no config mount needed)
    const binds = [`${config.workspace}:/workspace:rw`];

    const container = await this.docker.createContainer({
      name: `agent-${config.agentId}`,
      Image: "crowd-mcp-agent:latest",
      Env: containerEnv,
      HostConfig: {
        Binds: binds,
      },
      // Essential flags for ACP stdin communication
      Tty: true,        // Allocate pseudo-TTY for interactive tools
      OpenStdin: true,  // Keep stdin open for ACP communication
      AttachStdin: true, // Attach to stdin at creation time
    });

    await container.start();

    // Create ACP client for the container if AgentMcpServer is available
    if (this.agentMcpServer) {
      try {
        await this.agentMcpServer.createACPClient(config.agentId, container.id || "", acpResult.mcpServers);
      } catch (error) {
        // Log error but don't fail container creation - ACP is optional
        console.error(`Failed to create ACP client for agent ${config.agentId}:`, error);
      }
    }

    return {
      id: config.agentId,
      task: config.task,
      containerId: container.id || "",
    };
  }
}
