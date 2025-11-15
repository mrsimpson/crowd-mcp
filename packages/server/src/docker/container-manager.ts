import type Dockerode from "dockerode";
import type { Agent } from "@crowd-mcp/shared";
import { EnvLoader } from "../config/index.js";
import { AgentDefinitionLoader } from "../agent-config/agent-definition-loader.js";
import { ConfigGenerator } from "../agent-config/config-generator.js";
import type { AgentMcpServer } from "../mcp/agent-mcp-server.js";
import { McpLogger } from "../mcp/mcp-logger.js";
import { homedir } from "os";
import { access, constants } from "fs/promises";

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
    private logger: McpLogger,
    private docker: Dockerode,
    private agentMcpServer?: AgentMcpServer,
    agentMcpPort: number = 3100,
  ) {
    this.envLoader = new EnvLoader();
    this.agentMcpPort = agentMcpPort;
    this.logger = logger;

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

    // Add Git Personal Access Tokens if available in host environment
    if (process.env.GITHUB_TOKEN) {
      containerEnv.push(`GITHUB_TOKEN=${process.env.GITHUB_TOKEN}`);
      await this.logger.info(
        "🔑 Added GitHub Personal Access Token to agent environment",
      );
    }

    if (process.env.GITLAB_TOKEN) {
      containerEnv.push(`GITLAB_TOKEN=${process.env.GITLAB_TOKEN}`);
      await this.logger.info(
        "🔑 Added GitLab Personal Access Token to agent environment",
      );
    }

    // Generate ACP MCP servers (messaging server always included)
    const acpResult = await this.configGenerator.generateAcpMcpServers(
      config.agentType,
      config.workspace,
      {
        agentId: config.agentId,
        agentMcpPort: this.agentMcpPort,
      },
    );

    this.logger.info(
      `📋 Generated ${acpResult.mcpServers.length} MCP servers for agent ${config.agentId}`,
    );

    // No longer need AGENT_CONFIG_BASE64 - ACP handles configuration via session creation

    // Build volume binds - workspace and Git credentials
    const binds = [`${config.workspace}:/workspace:rw`];

    // Add Git credential mounts if they exist on the host
    await this.addGitCredentialMounts(binds);

    const container = await this.docker.createContainer({
      name: `agent-${config.agentId}`,
      Image: "crowd-mcp-agent:latest",
      Env: containerEnv,
      HostConfig: {
        Binds: binds,
      },
      // Essential flags for ACP stdin communication
      Tty: true, // Allocate pseudo-TTY for interactive tools
      OpenStdin: true, // Keep stdin open for ACP communication
      AttachStdin: true, // Attach to stdin at creation time
    });

    await container.start();

    // Create ACP client for the container - this is required for agent functionality
    if (this.agentMcpServer) {
      this.logger.info(`🔗 Creating ACP client for agent ${config.agentId}`);
      try {
        await this.agentMcpServer.createACPClient(
          config.agentId,
          container.id || "",
          acpResult.mcpServers,
        );
        this.logger.info(
          `✅ ACP client created successfully for agent ${config.agentId}`,
        );
      } catch (error) {
        // ACP client creation is required - fail the spawn if it doesn't work
        this.logger.error(
          `❌ Failed to create ACP client for agent ${config.agentId}: ${error}`,
        );

        // Clean up the container since ACP setup failed
        try {
          await container.remove({ force: true });
          this.logger.info(
            `🧹 Cleaned up container for failed agent ${config.agentId}`,
          );
        } catch (cleanupError) {
          this.logger.error(
            `Failed to cleanup container for ${config.agentId}: ${cleanupError}`,
          );
        }

        throw new Error(
          `Failed to establish ACP session for agent ${config.agentId}: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    } else {
      throw new Error(
        "AgentMcpServer not available - cannot create ACP client",
      );
    }

    return {
      id: config.agentId,
      task: config.task,
      containerId: container.id || "",
    };
  }

  /**
   * Execute Git clone operation in a running agent container
   */
  async cloneRepositoryInAgent(
    agentId: string,
    repositoryUrl: string,
    targetPath: string,
    branch: string = "main",
  ): Promise<{ success: boolean; output?: string; error?: string }> {
    try {
      await this.logger.info("🔄 Starting Git clone operation", {
        agentId,
        repositoryUrl,
        targetPath,
        branch,
      });

      // Find the container for this agent
      const containerName = `agent-${agentId}`;
      const container = this.docker.getContainer(containerName);

      // Check if container exists and is running
      const containerInfo = await container.inspect();
      if (!containerInfo.State.Running) {
        throw new Error(`Agent container ${containerName} is not running`);
      }

      // Prepare git clone command
      const gitCommand = [
        "git",
        "clone",
        "--branch",
        branch,
        "--single-branch",
        repositoryUrl,
        targetPath,
      ];

      await this.logger.info("🔧 Executing git clone command", {
        agentId,
        command: gitCommand.join(" "),
      });

      // Execute git clone in the container
      const exec = await container.exec({
        Cmd: gitCommand,
        WorkingDir: "/workspace",
        AttachStdout: true,
        AttachStderr: true,
      });

      const execStream = await exec.start({ hijack: true, stdin: false });

      // Collect output
      let output = "";
      let error = "";

      return new Promise((resolve, reject) => {
        execStream.on("data", (chunk) => {
          const data = chunk.toString();
          if (chunk[0] === 1) {
            // stdout
            output += data.slice(8); // Remove Docker stream header
          } else if (chunk[0] === 2) {
            // stderr
            error += data.slice(8); // Remove Docker stream header
          }
        });

        execStream.on("end", async () => {
          try {
            const execInfo = await exec.inspect();
            const exitCode = execInfo.ExitCode;

            if (exitCode === 0) {
              await this.logger.info("✅ Git clone completed successfully", {
                agentId,
                targetPath,
                output: output.trim(),
              });
              resolve({ success: true, output: output.trim() });
            } else {
              await this.logger.error("❌ Git clone failed", {
                agentId,
                exitCode,
                error: error.trim() || output.trim(),
              });
              resolve({
                success: false,
                error:
                  error.trim() ||
                  output.trim() ||
                  `Git clone exited with code ${exitCode}`,
              });
            }
          } catch (inspectError) {
            reject(new Error(`Failed to inspect exec result: ${inspectError}`));
          }
        });

        execStream.on("error", (streamError) => {
          reject(new Error(`Stream error: ${streamError}`));
        });
      });
    } catch (error) {
      await this.logger.error("💥 Git clone operation failed", {
        agentId,
        repositoryUrl,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Add Git credential configuration for Personal Access Token authentication
   */
  private async addGitCredentialMounts(binds: string[]): Promise<void> {
    // No longer mount SSH keys - we use Personal Access Tokens via environment variables
    await this.logger.info(
      "🔑 Git authentication will use Personal Access Tokens (GITHUB_TOKEN, GITLAB_TOKEN)",
    );

    // Optionally mount global Git config for user preferences (name, email, etc.)
    const homeDir = homedir();
    try {
      const gitConfig = `${homeDir}/.gitconfig`;
      await access(gitConfig, constants.R_OK);
      binds.push(`${gitConfig}:/root/.gitconfig-host:ro`);
      await this.logger.info(
        "⚙️  Mounted host Git configuration for reference",
        { gitConfig },
      );
    } catch {
      await this.logger.info(
        "ℹ️  No global Git config found - using defaults",
        {
          gitConfig: `${homeDir}/.gitconfig`,
        },
      );
    }
  }
}
