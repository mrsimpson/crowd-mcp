import { readFile } from "fs/promises";
import { join } from "path";
import type {
  OpenCodeConfig,
  ConfigValidationError,
  OpenCodeAgent,
} from "./types.js";

export class ConfigValidator {
  /**
   * Validates that the OpenCode configuration has at least one provider
   * and that all configured agents reference existing providers.
   */
  async validateConfig(
    workspacePath: string,
  ): Promise<
    { valid: true } | { valid: false; errors: ConfigValidationError[] }
  > {
    const errors: ConfigValidationError[] = [];

    // Try to read config file
    const configPath = join(workspacePath, ".crowd/opencode/opencode.json");
    let config: OpenCodeConfig;

    try {
      const configContent = await readFile(configPath, "utf-8");
      config = JSON.parse(configContent) as OpenCodeConfig;
    } catch (error) {
      errors.push({
        type: "config_missing",
        message: `OpenCode configuration file not found or invalid at ${configPath}`,
        details: {
          error: error instanceof Error ? error.message : String(error),
          expectedPath: configPath,
          hint: "Create a .crowd/opencode/opencode.json file with at least one provider configured",
        },
      });
      return { valid: false, errors };
    }

    // Validate that at least one provider is configured
    if (!config.provider || Object.keys(config.provider).length === 0) {
      errors.push({
        type: "no_providers",
        message: "No LLM providers configured in opencode.json",
        details: {
          configPath,
          hint: "Add at least one provider to the 'provider' section",
          example: {
            provider: {
              anthropic: {
                npm: "@anthropic-ai/sdk",
                name: "Anthropic",
                options: {
                  apiKey: "{env:ANTHROPIC_API_KEY}",
                },
                models: {
                  "claude-3-5-sonnet-20241022": {
                    name: "Claude 3.5 Sonnet",
                  },
                },
              },
            },
          },
        },
      });
      return { valid: false, errors };
    }

    // Get list of configured provider names
    const providerNames = Object.keys(config.provider);

    // Validate that agents reference existing providers
    if (config.agents) {
      for (const [agentName, agentConfig] of Object.entries(config.agents)) {
        const agent = agentConfig as OpenCodeAgent;
        if (agent.model) {
          const providerName = this.extractProviderFromModel(agent.model);
          if (providerName && !providerNames.includes(providerName)) {
            errors.push({
              type: "invalid_agent_provider",
              message: `Agent "${agentName}" references non-existent provider "${providerName}"`,
              details: {
                agentName,
                modelConfig: agent.model,
                providerName,
                availableProviders: providerNames,
                hint: `Either add provider "${providerName}" to the config or change the agent's model to use one of: ${providerNames.join(", ")}`,
              },
            });
          }
        }
      }
    }

    if (errors.length > 0) {
      return { valid: false, errors };
    }

    return { valid: true };
  }

  /**
   * Extracts the provider name from a model string.
   * Model format is typically "provider.model-id" (e.g., "anthropic.claude-3-5-sonnet")
   */
  private extractProviderFromModel(model: string): string | null {
    const parts = model.split(".");
    return parts.length > 1 ? parts[0] : null;
  }

  /**
   * Gets the first configured provider name (used as default)
   */
  async getDefaultProvider(workspacePath: string): Promise<string | null> {
    try {
      const configPath = join(workspacePath, ".crowd/opencode/opencode.json");
      const configContent = await readFile(configPath, "utf-8");
      const config = JSON.parse(configContent) as OpenCodeConfig;

      if (config.provider && Object.keys(config.provider).length > 0) {
        return Object.keys(config.provider)[0];
      }
    } catch {
      // Ignore errors, validation will catch them
    }

    return null;
  }

  /**
   * Formats validation errors into a human-readable message
   */
  formatValidationErrors(errors: ConfigValidationError[]): string {
    const lines: string[] = [
      "❌ OpenCode configuration validation failed:",
      "",
    ];

    for (const error of errors) {
      lines.push(`  • ${error.message}`);
      if (error.details?.hint) {
        lines.push(`    Hint: ${error.details.hint}`);
      }
      if (error.details?.example) {
        lines.push(
          `    Example:\n${JSON.stringify(error.details.example, null, 2)
            .split("\n")
            .map((l) => `      ${l}`)
            .join("\n")}`,
        );
      }
      lines.push("");
    }

    return lines.join("\n");
  }
}
