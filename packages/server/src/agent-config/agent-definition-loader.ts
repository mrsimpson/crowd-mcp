import { readFile, readdir, access } from "fs/promises";
import { join } from "path";
import { parse as parseYaml } from "yaml";
import type { AgentDefinition } from "./types.js";

/**
 * Agent Definition Loader
 *
 * Loads agent definitions from YAML files in .crowd/agents/ directory.
 * Validates required fields and agent name consistency.
 */
export class AgentDefinitionLoader {
  /**
   * Load an agent definition from YAML file
   *
   * @param workspaceDir - Root workspace directory
   * @param agentName - Name of the agent (filename without extension)
   * @returns Parsed and validated agent definition
   * @throws Error if file not found, invalid YAML, or validation fails
   *
   * @example
   * const loader = new AgentDefinitionLoader();
   * const agent = await loader.load("/workspace", "architect");
   * logger.info(agent.systemPrompt);
   */
  async load(
    workspaceDir: string,
    agentName: string,
  ): Promise<AgentDefinition> {
    const agentPath = this.getAgentPath(workspaceDir, agentName);

    // Check if file exists
    try {
      await access(agentPath);
    } catch {
      throw new Error(
        `Agent definition '${agentName}' not found at ${agentPath}`,
      );
    }

    // Read and parse YAML
    const content = await readFile(agentPath, "utf-8");
    let parsed: unknown;
    try {
      parsed = parseYaml(content);
    } catch (error) {
      throw new Error(
        `Invalid YAML in agent definition '${agentName}': ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // Validate and cast
    this.validate(parsed, agentName);
    return parsed as AgentDefinition;
  }

  /**
   * List all available agent definitions
   *
   * @param workspaceDir - Root workspace directory
   * @returns Array of agent names (without extension)
   *
   * @example
   * const loader = new AgentDefinitionLoader();
   * const agents = await loader.list("/workspace");
   * // ["architect", "coder", "reviewer"]
   */
  async list(workspaceDir: string): Promise<string[]> {
    const agentsDir = join(workspaceDir, ".crowd/agents");

    try {
      const files = await readdir(agentsDir);
      return files
        .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
        .map((f) => f.replace(/\.ya?ml$/, ""));
    } catch {
      // Directory doesn't exist
      return [];
    }
  }

  /**
   * Check if an agent definition exists
   *
   * @param workspaceDir - Root workspace directory
   * @param agentName - Name of the agent
   * @returns true if agent definition exists
   *
   * @example
   * const loader = new AgentDefinitionLoader();
   * if (await loader.exists("/workspace", "architect")) {
   *   const agent = await loader.load("/workspace", "architect");
   * }
   */
  async exists(workspaceDir: string, agentName: string): Promise<boolean> {
    const agentPath = this.getAgentPath(workspaceDir, agentName);
    try {
      await access(agentPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the full path to an agent definition file
   */
  private getAgentPath(workspaceDir: string, agentName: string): string {
    // Try .yaml first, then .yml
    return join(workspaceDir, ".crowd/agents", `${agentName}.yaml`);
  }

  /**
   * Validate agent definition structure and required fields
   */
  private validate(parsed: unknown, expectedName: string): void {
    if (!parsed || typeof parsed !== "object") {
      throw new Error("Agent definition must be an object");
    }

    const obj = parsed as Record<string, unknown>;

    // Validate required fields
    if (!obj.name || typeof obj.name !== "string") {
      throw new Error("Agent definition requires 'name' field (string)");
    }

    if (!obj.systemPrompt || typeof obj.systemPrompt !== "string") {
      throw new Error(
        "Agent definition requires 'systemPrompt' field (string)",
      );
    }

    // Validate name matches filename
    if (obj.name !== expectedName) {
      throw new Error(
        `Agent name mismatch: file is '${expectedName}.yaml' but name field is '${obj.name}'`,
      );
    }

    // Optional field type checks
    if (obj.displayName !== undefined && typeof obj.displayName !== "string") {
      throw new Error("Field 'displayName' must be a string");
    }

    if (
      obj.preferredModels !== undefined &&
      !Array.isArray(obj.preferredModels)
    ) {
      throw new Error("Field 'preferredModels' must be an array");
    }

    if (obj.llmSettings !== undefined && typeof obj.llmSettings !== "object") {
      throw new Error("Field 'llmSettings' must be an object");
    }

    if (obj.mcpServers !== undefined && typeof obj.mcpServers !== "object") {
      throw new Error("Field 'mcpServers' must be an object");
    }

    if (obj.capabilities !== undefined && !Array.isArray(obj.capabilities)) {
      throw new Error("Field 'capabilities' must be an array");
    }

    if (obj.container !== undefined && typeof obj.container !== "object") {
      throw new Error("Field 'container' must be an object");
    }
  }
}
