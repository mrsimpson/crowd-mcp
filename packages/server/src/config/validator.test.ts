import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ConfigValidator } from "./validator.js";
import { mkdir, writeFile, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

describe("ConfigValidator", () => {
  let validator: ConfigValidator;
  let testDir: string;

  beforeEach(async () => {
    validator = new ConfigValidator();
    testDir = join(tmpdir(), `crowd-mcp-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe("validateConfig", () => {
    it("should fail when config file is missing", async () => {
      const result = await validator.validateConfig(testDir);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors?.[0]?.type).toBe("config_missing");
    });

    it("should fail when no providers are configured", async () => {
      const configDir = join(testDir, ".crowd/opencode");
      await mkdir(configDir, { recursive: true });
      await writeFile(
        join(configDir, "opencode.json"),
        JSON.stringify({ provider: {} }),
      );

      const result = await validator.validateConfig(testDir);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors?.[0]?.type).toBe("no_providers");
    });

    it("should pass when at least one provider is configured", async () => {
      const configDir = join(testDir, ".crowd/opencode");
      await mkdir(configDir, { recursive: true });
      await writeFile(
        join(configDir, "opencode.json"),
        JSON.stringify({
          provider: {
            anthropic: {
              npm: "@anthropic-ai/sdk",
              models: {
                "claude-3-5-sonnet": { name: "Claude 3.5 Sonnet" },
              },
            },
          },
        }),
      );

      const result = await validator.validateConfig(testDir);

      expect(result.valid).toBe(true);
    });

    it("should fail when agent references non-existent provider", async () => {
      const configDir = join(testDir, ".crowd/opencode");
      await mkdir(configDir, { recursive: true });
      await writeFile(
        join(configDir, "opencode.json"),
        JSON.stringify({
          provider: {
            anthropic: {
              npm: "@anthropic-ai/sdk",
              models: { "claude-3-5-sonnet": { name: "Claude" } },
            },
          },
          agents: {
            coder: {
              model: "openai.gpt-4", // References non-existent "openai" provider
              description: "Code implementation agent",
            },
          },
        }),
      );

      const result = await validator.validateConfig(testDir);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors?.[0]?.type).toBe("invalid_agent_provider");
      expect(result.errors?.[0]?.details?.providerName).toBe("openai");
    });

    it("should pass when all agents reference existing providers", async () => {
      const configDir = join(testDir, ".crowd/opencode");
      await mkdir(configDir, { recursive: true });
      await writeFile(
        join(configDir, "opencode.json"),
        JSON.stringify({
          provider: {
            anthropic: {
              npm: "@anthropic-ai/sdk",
              models: { "claude-3-5-sonnet": { name: "Claude" } },
            },
            openai: {
              npm: "@ai-sdk/openai",
              models: { "gpt-4": { name: "GPT-4" } },
            },
          },
          agents: {
            architect: {
              model: "anthropic.claude-3-5-sonnet",
              description: "Architecture agent",
            },
            coder: {
              model: "openai.gpt-4",
              description: "Code implementation agent",
            },
          },
        }),
      );

      const result = await validator.validateConfig(testDir);

      expect(result.valid).toBe(true);
    });

    it("should pass when agents exist but don't specify model", async () => {
      const configDir = join(testDir, ".crowd/opencode");
      await mkdir(configDir, { recursive: true });
      await writeFile(
        join(configDir, "opencode.json"),
        JSON.stringify({
          provider: {
            anthropic: {
              npm: "@anthropic-ai/sdk",
              models: { "claude-3-5-sonnet": { name: "Claude" } },
            },
          },
          agents: {
            helper: {
              description: "Helper agent without specific model",
              temperature: 0.7,
            },
          },
        }),
      );

      const result = await validator.validateConfig(testDir);

      expect(result.valid).toBe(true);
    });
  });

  describe("getDefaultProvider", () => {
    it("should return first configured provider", async () => {
      const configDir = join(testDir, ".crowd/opencode");
      await mkdir(configDir, { recursive: true });
      await writeFile(
        join(configDir, "opencode.json"),
        JSON.stringify({
          provider: {
            anthropic: { npm: "@anthropic-ai/sdk" },
            openai: { npm: "@ai-sdk/openai" },
          },
        }),
      );

      const defaultProvider = await validator.getDefaultProvider(testDir);

      expect(defaultProvider).toBe("anthropic");
    });

    it("should return null when config is missing", async () => {
      const defaultProvider = await validator.getDefaultProvider(testDir);

      expect(defaultProvider).toBeNull();
    });
  });

  describe("formatValidationErrors", () => {
    it("should format errors with hints and examples", () => {
      const errors = [
        {
          type: "no_providers" as const,
          message: "No providers configured",
          details: {
            hint: "Add at least one provider",
            example: { provider: { anthropic: { npm: "@anthropic-ai/sdk" } } },
          },
        },
      ];

      const formatted = validator.formatValidationErrors(errors);

      expect(formatted).toContain("No providers configured");
      expect(formatted).toContain("Add at least one provider");
      expect(formatted).toContain("anthropic");
    });
  });
});
