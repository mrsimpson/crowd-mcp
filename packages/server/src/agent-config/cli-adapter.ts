import type { AgentDefinition } from "./types.js";

/**
 * CLI-specific configuration output
 *
 * Generic type that represents the configuration format for a specific CLI.
 * Each CLI adapter produces its own format.
 */
export type CliConfig = Record<string, unknown>;

/**
 * Context for CLI config generation
 */
export interface CliConfigContext {
  agentId: string;
  workspaceDir: string;
  agentMcpPort: number;
}

/**
 * Abstract CLI Adapter
 *
 * Base class for CLI-specific configuration generators.
 * Each CLI (OpenCode, Aider, etc.) implements this to convert
 * AgentDefinition to CLI-specific configuration format.
 */
export abstract class CliAdapter {
  /**
   * Get the name of the CLI this adapter supports
   *
   * @returns CLI name (e.g., "opencode", "aider")
   *
   * @example
   * const adapter = new OpenCodeAdapter();
   * adapter.getCliName(); // "opencode"
   */
  abstract getCliName(): string;

  /**
   * Generate CLI-specific configuration from agent definition
   *
   * This method must:
   * 1. Convert AgentDefinition to CLI-specific format
   * 2. Inject messaging MCP server automatically
   * 3. Resolve environment variable templates
   * 4. Apply model preferences from preferredModels list
   *
   * @param definition - Agent definition from YAML
   * @param context - Context with agentId and ports
   * @returns CLI-specific configuration object
   *
   * @example
   * const adapter = new OpenCodeAdapter();
   * const config = await adapter.generate(agentDef, {
   *   agentId: "agent-123",
   *   workspaceDir: "/workspace",
   *   agentMcpPort: 3100
   * });
   */
  abstract generate(
    definition: AgentDefinition,
    context: CliConfigContext,
  ): Promise<CliConfig>;

  /**
   * Validate that the generated configuration is valid for the CLI
   *
   * @param config - Generated CLI configuration
   * @throws Error if configuration is invalid
   *
   * @example
   * const adapter = new OpenCodeAdapter();
   * const config = await adapter.generate(agentDef, context);
   * await adapter.validate(config); // throws if invalid
   */
  abstract validate(config: CliConfig): Promise<void>;

  /**
   * Get the file path where the configuration should be written
   *
   * @param workspaceDir - Workspace root directory
   * @param agentId - Agent ID
   * @returns Absolute path to config file
   *
   * @example
   * const adapter = new OpenCodeAdapter();
   * adapter.getConfigPath("/workspace", "agent-123");
   * // "/workspace/.crowd/runtime/agents/agent-123/opencode.json"
   */
  abstract getConfigPath(workspaceDir: string, agentId: string): string;

  /**
   * Build messaging MCP server configuration
   *
   * Helper method to generate the messaging server config that gets
   * automatically injected into every agent.
   *
   * @param agentId - Agent ID
   * @param agentMcpPort - Port where Agent MCP Server is running
   * @returns Messaging MCP server URL
   *
   * @example
   * const url = this.buildMessagingMcpUrl("agent-123", 3100);
   * // "http://host.docker.internal:3100/mcp"
   */
  protected buildMessagingMcpUrl(
    agentId: string,
    agentMcpPort: number,
  ): string {
    return `http://host.docker.internal:${agentMcpPort}/mcp`;
  }
}
