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
    const config: CliConfig = {
      systemPrompt: definition.systemPrompt,
      mcpServers: {},
    };

    // Add model preferences if specified
    if (definition.preferredModels && definition.preferredModels.length > 0) {
      config.model = definition.preferredModels[0];
      if (definition.preferredModels.length > 1) {
        config.small_model = definition.preferredModels[1];
      }
    }

    // Add LLM settings if specified
    if (definition.llmSettings) {
      if (definition.llmSettings.temperature !== undefined) {
        config.temperature = definition.llmSettings.temperature;
      }
      if (definition.llmSettings.reasoningEffort !== undefined) {
        config.reasoningEffort = definition.llmSettings.reasoningEffort;
      }
    }

    // Convert and add custom MCP servers
    const mcpServers: Record<string, unknown> = {};
    if (definition.mcpServers) {
      for (const [name, serverConfig] of Object.entries(
        definition.mcpServers,
      )) {
        mcpServers[name] = this.convertMcpServer(serverConfig);
      }
    }

    // Inject messaging MCP server
    mcpServers.messaging = {
      type: "sse",
      url: this.buildMessagingMcpUrl(context.agentId, context.agentMcpPort),
    };

    config.mcpServers = mcpServers;

    return config;
  }

  async validate(config: CliConfig): Promise<void> {
    if (!config.systemPrompt || typeof config.systemPrompt !== "string") {
      throw new Error(
        "OpenCode config validation failed: systemPrompt is required",
      );
    }

    if (!config.mcpServers || typeof config.mcpServers !== "object") {
      throw new Error(
        "OpenCode config validation failed: mcpServers is required",
      );
    }
  }

  /**
   * Convert agent MCP server config to OpenCode format and resolve templates
   */
  private convertMcpServer(
    serverConfig: McpServerConfig,
  ): Record<string, unknown> {
    // Resolve environment variables in the entire config
    const resolved = this.envResolver.resolveObject(serverConfig);

    // Return as-is (OpenCode format matches our schema)
    return resolved as unknown as Record<string, unknown>;
  }
}
