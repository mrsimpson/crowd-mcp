import { join } from "path";
import {
  CliAdapter,
  type CliConfig,
  type CliConfigContext,
} from "./cli-adapter.js";
import type { AgentDefinition, McpServerConfig } from "./types.js";
import { EnvTemplateResolver } from "./env-template-resolver.js";

/**
 * OpenCode CLI Adapter
 *
 * Generates OpenCode-specific configuration from agent definitions.
 * Automatically injects messaging MCP server and resolves environment templates.
 */
export class OpenCodeAdapter extends CliAdapter {
  private envResolver: EnvTemplateResolver;

  constructor() {
    super();
    this.envResolver = new EnvTemplateResolver();
  }

  getCliName(): string {
    return "opencode";
  }

  getConfigPath(workspaceDir: string, agentId: string): string {
    return join(
      workspaceDir,
      ".crowd/runtime/agents",
      agentId,
      "opencode.json",
    );
  }

  async generate(
    definition: AgentDefinition,
    context: CliConfigContext,
  ): Promise<CliConfig> {
    // Load base workspace config (contains provider section)
    const baseConfig = await this.loadBaseConfig(context.workspaceDir);

    // Build agent-specific configuration
    const agentConfig: Record<string, unknown> = {
      prompt: definition.systemPrompt, // OpenCode uses "prompt" not "systemPrompt"
      mode: "all", // Agent available in all modes
    };

    // Add model preferences if specified
    if (definition.preferredModels && definition.preferredModels.length > 0) {
      agentConfig.model = definition.preferredModels[0];
    }

    // Add LLM settings if specified
    if (definition.llmSettings) {
      if (definition.llmSettings.temperature !== undefined) {
        agentConfig.temperature = definition.llmSettings.temperature;
      }
      // Note: reasoningEffort not in OpenCode schema, omit it
    }

    // Convert and add custom MCP servers to base config
    const mcp: Record<string, unknown> =
      (baseConfig.mcp as Record<string, unknown>) || {};

    if (definition.mcpServers) {
      for (const [name, serverConfig] of Object.entries(
        definition.mcpServers,
      )) {
        mcp[name] = this.convertMcpServer(serverConfig);
      }
    }

    // Inject messaging MCP server (type: "remote" for SSE)
    mcp.messaging = {
      type: "remote",
      url: this.buildMessagingMcpUrl(context.agentId, context.agentMcpPort),
    };

    // Merge everything into complete config
    const config: CliConfig = {
      ...baseConfig,
      mcp, // OpenCode uses "mcp" not "mcpServers"
      agent: {
        [definition.name]: agentConfig,
      },
    };

    return config;
  }

  /**
   * Load base OpenCode config from workspace
   * This includes the provider configuration needed by OpenCode
   */
  private async loadBaseConfig(
    workspaceDir: string,
  ): Promise<Record<string, unknown>> {
    const { readFile } = await import("fs/promises");
    const baseConfigPath = join(workspaceDir, ".crowd/opencode/opencode.json");

    try {
      const content = await readFile(baseConfigPath, "utf-8");
      return JSON.parse(content) as Record<string, unknown>;
    } catch (error) {
      // If base config doesn't exist, return minimal config
      console.warn(
        `Warning: Base OpenCode config not found at ${baseConfigPath}, using minimal config`,
      );
      return {
        $schema: "https://opencode.ai/config.json",
      };
    }
  }

  async validate(config: CliConfig): Promise<void> {
    // Validate that config has either provider section or is using defaults
    if (!config.provider && !config.$schema) {
      console.warn(
        "Warning: OpenCode config has no provider section - OpenCode may not work correctly",
      );
    }

    // Validate MCP configuration exists
    if (!config.mcp || typeof config.mcp !== "object") {
      throw new Error(
        "OpenCode config validation failed: mcp section is required",
      );
    }

    // Validate messaging MCP server is present
    const mcpConfig = config.mcp as Record<string, unknown>;
    if (!mcpConfig.messaging) {
      throw new Error(
        "OpenCode config validation failed: mcp.messaging is required for agent communication",
      );
    }
  }

  /**
   * Convert agent MCP server config to OpenCode format and resolve templates
   * OpenCode schema: https://opencode.ai/config.json
   */
  private convertMcpServer(
    serverConfig: McpServerConfig,
  ): Record<string, unknown> {
    // Resolve environment variables in the entire config
    const resolved = this.envResolver.resolveObject(
      serverConfig,
    ) as McpServerConfig;

    // Convert to OpenCode MCP format
    if (resolved.type === "stdio") {
      // OpenCode uses "local" type with "command" array
      const command = [resolved.command, ...(resolved.args || [])];
      return {
        type: "local",
        command,
        environment: resolved.env || {}, // OpenCode uses "environment" not "env"
      };
    } else if (resolved.type === "http") {
      // OpenCode uses "remote" type for HTTP/SSE servers
      return {
        type: "remote",
        url: resolved.url,
        headers: resolved.headers || {},
      };
    }

    // Fallback: return as-is
    return resolved as unknown as Record<string, unknown>;
  }
}
