import type Dockerode from "dockerode";
import type { Agent } from "@crowd-mcp/shared";
import { EnvLoader } from "../config/index.js";
import { join } from "path";

export interface SpawnAgentConfig {
  agentId: string;
  task: string;
  workspace: string;
}

export class ContainerManager {
  private envLoader: EnvLoader;

  constructor(private docker: Dockerode) {
    this.envLoader = new EnvLoader();
  }

  async spawnAgent(config: SpawnAgentConfig): Promise<Agent> {
    // Load environment variables from .crowd/opencode/.env and .env.local
    const envVars = this.envLoader.loadEnvVars(config.workspace);

    // Build container environment variables
    const containerEnv = [
      `AGENT_ID=${config.agentId}`,
      `TASK=${config.task}`,
      ...envVars,
    ];

    // Build volume binds
    const configDir = join(config.workspace, ".crowd/opencode");
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
