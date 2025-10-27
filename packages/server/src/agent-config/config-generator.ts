import { mkdir, writeFile } from "fs/promises";
import { dirname } from "path";
import type { AgentDefinitionLoader } from "./agent-definition-loader.js";
import type { CliAdapter } from "./cli-adapter.js";

/**
 * Config generation context
 */
export interface ConfigGenerationContext {
  agentId: string;
  agentMcpPort: number;
}

/**
 * Config generation result (file-based)
 */
export interface ConfigGenerationResult {
  configPath: string;
  cliName: string;
}

/**
 * Config generation result (JSON string)
 */
export interface ConfigGenerationJsonResult {
  configJson: string;
  cliName: string;
}

/**
 * Configuration Generator
 *
 * Orchestrates the generation of CLI-specific configurations from agent definitions.
 * Handles loading agent definitions, generating configs, and writing them to disk.
 */
export class ConfigGenerator {
  constructor(
    private loader: AgentDefinitionLoader,
    private adapter: CliAdapter,
  ) {}

  /**
   * Generate CLI configuration for an agent
   *
   * This method:
   * 1. Loads the agent definition from YAML
   * 2. Generates CLI-specific configuration using the adapter
   * 3. Creates the runtime directory structure
   * 4. Writes the configuration file
   * 5. Returns the path to the generated config
   *
   * @param agentName - Name of the agent (from .crowd/agents/{name}.yaml)
   * @param workspaceDir - Workspace root directory
   * @param context - Generation context with agent ID and ports
   * @returns Result with config path and CLI name
   *
   * @example
   * const generator = new ConfigGenerator(loader, adapter);
   * const result = await generator.generate("architect", "/workspace", {
   *   agentId: "agent-123",
   *   agentMcpPort: 3100
   * });
   * console.log(result.configPath);
   * // "/workspace/.crowd/runtime/agents/agent-123/opencode.json"
   */
  async generate(
    agentName: string,
    workspaceDir: string,
    context: ConfigGenerationContext,
  ): Promise<ConfigGenerationResult> {
    // Load agent definition
    const definition = await this.loader.load(workspaceDir, agentName);

    // Generate CLI-specific configuration
    const config = await this.adapter.generate(definition, {
      agentId: context.agentId,
      workspaceDir,
      agentMcpPort: context.agentMcpPort,
    });

    // Validate generated config
    await this.adapter.validate(config);

    // Get output path
    const configPath = this.adapter.getConfigPath(
      workspaceDir,
      context.agentId,
    );

    // Create directory structure
    await mkdir(dirname(configPath), { recursive: true });

    // Write config to file
    const configJson = JSON.stringify(config, null, 2);
    await writeFile(configPath, configJson, "utf-8");

    return {
      configPath,
      cliName: this.adapter.getCliName(),
    };
  }

  /**
   * Generate CLI configuration as JSON string (without writing to file)
   *
   * This method:
   * 1. Loads the agent definition from YAML
   * 2. Generates CLI-specific configuration using the adapter
   * 3. Validates the configuration
   * 4. Returns the configuration as JSON string
   *
   * @param agentName - Name of the agent (from .crowd/agents/{name}.yaml)
   * @param workspaceDir - Workspace root directory
   * @param context - Generation context with agent ID and ports
   * @returns Result with config JSON string and CLI name
   *
   * @example
   * const generator = new ConfigGenerator(loader, adapter);
   * const result = await generator.generateJson("architect", "/workspace", {
   *   agentId: "agent-123",
   *   agentMcpPort: 3100
   * });
   * console.log(result.configJson); // JSON string
   * console.log(result.cliName); // "opencode"
   */
  async generateJson(
    agentName: string,
    workspaceDir: string,
    context: ConfigGenerationContext,
  ): Promise<ConfigGenerationJsonResult> {
    // Load agent definition
    const definition = await this.loader.load(workspaceDir, agentName);

    // Generate CLI-specific configuration
    const config = await this.adapter.generate(definition, {
      agentId: context.agentId,
      workspaceDir,
      agentMcpPort: context.agentMcpPort,
    });

    // Validate generated config
    await this.adapter.validate(config);

    // Convert to JSON string
    const configJson = JSON.stringify(config, null, 2);

    return {
      configJson,
      cliName: this.adapter.getCliName(),
    };
  }

  /**
   * Get the path where config would be generated for an agent
   *
   * @param workspaceDir - Workspace root directory
   * @param agentId - Agent ID
   * @returns Absolute path to config file
   */
  getConfigPath(workspaceDir: string, agentId: string): string {
    return this.adapter.getConfigPath(workspaceDir, agentId);
  }
}
