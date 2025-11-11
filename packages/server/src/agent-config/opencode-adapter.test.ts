import { describe, it, expect, beforeEach } from "vitest";
import { OpenCodeAdapter } from "./opencode-adapter.js";
import type { AgentDefinition } from "./types.js";
import type { CliConfigContext } from "./cli-adapter.js";

describe("OpenCodeAdapter", () => {
  let adapter: OpenCodeAdapter;
  let context: CliConfigContext;

  beforeEach(() => {
    adapter = new OpenCodeAdapter();
    context = {
      agentId: "agent-test-123",
      workspaceDir: "/workspace",
      agentMcpPort: 3100,
    };
  });

  describe("getCliName", () => {
    it("should return 'opencode'", () => {
      expect(adapter.getCliName()).toBe("opencode");
    });
  });

  describe("getConfigPath", () => {
    it("should return path to opencode.json in runtime directory", () => {
      const path = adapter.getConfigPath("/workspace", "agent-123");

      expect(path).toBe(
        "/workspace/.crowd/runtime/agents/agent-123/opencode.json",
      );
    });
  });

  describe("generate - Basic Behavior", () => {
    it("should generate minimal config with only system prompt", async () => {
      const definition: AgentDefinition = {
        name: "simple",
        systemPrompt: "You are a simple agent.",
      };

      const config = await adapter.generate(definition, context);

      // OpenCode uses agent[name].prompt structure
      const agent = config.agent as Record<string, Record<string, unknown>>;
      expect(agent.simple).toHaveProperty("prompt", "You are a simple agent.");
      expect(config).toHaveProperty("mcp");
    });

    it("should inject messaging MCP server automatically", async () => {
      const definition: AgentDefinition = {
        name: "test",
        systemPrompt: "Test agent",
      };

      const config = await adapter.generate(definition, context);

      const mcp = config.mcp as Record<string, unknown>;
      expect(mcp).toHaveProperty("messaging");
      expect(mcp.messaging).toEqual({
        type: "remote",
        url: "http://host.docker.internal:3100/mcp",
        enabled: true,
      });
    });

    it("should use first model from preferredModels as primary model", async () => {
      const definition: AgentDefinition = {
        name: "architect",
        systemPrompt: "Architect agent",
        preferredModels: [
          "anthropic.claude-sonnet-4",
          "anthropic.claude-haiku-3-5",
        ],
      };

      const config = await adapter.generate(definition, context);

      const agent = config.agent as Record<string, Record<string, unknown>>;
      expect(agent.architect).toHaveProperty(
        "model",
        "anthropic.claude-sonnet-4",
      );
    });

    it("should use only first model from preferredModels", async () => {
      const definition: AgentDefinition = {
        name: "architect",
        systemPrompt: "Architect agent",
        preferredModels: [
          "anthropic.claude-sonnet-4",
          "anthropic.claude-haiku-3-5",
        ],
      };

      const config = await adapter.generate(definition, context);

      const agent = config.agent as Record<string, Record<string, unknown>>;
      // OpenCode uses only the first model
      expect(agent.architect).not.toHaveProperty("small_model");
    });

    it("should omit model fields when preferredModels not specified", async () => {
      const definition: AgentDefinition = {
        name: "test",
        systemPrompt: "Test",
      };

      const config = await adapter.generate(definition, context);

      const agent = config.agent as Record<string, Record<string, unknown>>;
      expect(agent.test).not.toHaveProperty("model");
      expect(agent.test).not.toHaveProperty("small_model");
    });
  });

  describe("generate - MCP Servers", () => {
    it("should convert stdio MCP server configuration", async () => {
      const definition: AgentDefinition = {
        name: "test",
        systemPrompt: "Test",
        mcpServers: {
          filesystem: {
            type: "stdio",
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-filesystem"],
            env: {
              LOG_LEVEL: "info",
            },
          },
        },
      };

      const config = await adapter.generate(definition, context);

      // OpenCode converts stdio to "local" type with command array
      const mcp = config.mcp as Record<string, unknown>;
      expect(mcp.filesystem).toEqual({
        type: "local",
        command: ["npx", "-y", "@modelcontextprotocol/server-filesystem"],
        environment: {
          LOG_LEVEL: "info",
        },
        enabled: true,
      });
    });

    it("should convert HTTP MCP server configuration", async () => {
      const definition: AgentDefinition = {
        name: "test",
        systemPrompt: "Test",
        mcpServers: {
          github: {
            type: "http",
            url: "https://api.github.com/mcp",
            headers: {
              Authorization: "Bearer token123",
              "X-Custom": "value",
            },
          },
        },
      };

      const config = await adapter.generate(definition, context);

      // OpenCode converts http to "remote" type
      const mcp = config.mcp as Record<string, unknown>;
      expect(mcp.github).toEqual({
        type: "remote",
        url: "https://api.github.com/mcp",
        headers: {
          Authorization: "Bearer token123",
          "X-Custom": "value",
        },
        enabled: true,
      });
    });

    it("should preserve messaging server alongside custom MCP servers", async () => {
      const definition: AgentDefinition = {
        name: "test",
        systemPrompt: "Test",
        mcpServers: {
          filesystem: {
            type: "stdio",
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-filesystem"],
          },
        },
      };

      const config = await adapter.generate(definition, context);

      const mcp = config.mcp as Record<string, unknown>;
      expect(mcp).toHaveProperty("filesystem");
      expect(mcp).toHaveProperty("messaging");
      expect(Object.keys(mcp)).toHaveLength(2);
    });
  });

  describe("generate - LLM Settings", () => {
    it("should include temperature when specified", async () => {
      const definition: AgentDefinition = {
        name: "test",
        systemPrompt: "Test",
        llmSettings: {
          temperature: 0.7,
        },
      };

      const config = await adapter.generate(definition, context);

      const agent = config.agent as Record<string, Record<string, unknown>>;
      expect(agent.test).toHaveProperty("temperature", 0.7);
    });

    it("should omit reasoningEffort (not supported by OpenCode)", async () => {
      const definition: AgentDefinition = {
        name: "test",
        systemPrompt: "Test",
        llmSettings: {
          reasoningEffort: "high",
        },
      };

      const config = await adapter.generate(definition, context);

      // reasoningEffort is not supported in OpenCode schema
      const agent = config.agent as Record<string, Record<string, unknown>>;
      expect(agent.test).not.toHaveProperty("reasoningEffort");
    });

    it("should omit LLM settings when not specified", async () => {
      const definition: AgentDefinition = {
        name: "test",
        systemPrompt: "Test",
      };

      const config = await adapter.generate(definition, context);

      const agent = config.agent as Record<string, Record<string, unknown>>;
      expect(agent.test).not.toHaveProperty("temperature");
      expect(agent.test).not.toHaveProperty("reasoningEffort");
    });
  });

  describe("generate - Environment Template Resolution", () => {
    it("should resolve environment variables in MCP server env", async () => {
      process.env.TEST_TOKEN = "secret123";

      const definition: AgentDefinition = {
        name: "test",
        systemPrompt: "Test",
        mcpServers: {
          github: {
            type: "stdio",
            command: "npx",
            env: {
              GITHUB_TOKEN: "${TEST_TOKEN}",
            },
          },
        },
      };

      const config = await adapter.generate(definition, context);

      const mcp = config.mcp as Record<string, unknown>;
      const github = mcp.github as Record<string, unknown>;
      const environment = github.environment as Record<string, string>;
      expect(environment.GITHUB_TOKEN).toBe("secret123");

      delete process.env.TEST_TOKEN;
    });

    it("should resolve environment variables in HTTP headers", async () => {
      process.env.TEST_AUTH_TOKEN = "bearer-token-456";

      const definition: AgentDefinition = {
        name: "test",
        systemPrompt: "Test",
        mcpServers: {
          remote: {
            type: "http",
            url: "https://api.example.com",
            headers: {
              Authorization: "Bearer ${TEST_AUTH_TOKEN}",
            },
          },
        },
      };

      const config = await adapter.generate(definition, context);

      const mcp = config.mcp as Record<string, unknown>;
      const remote = mcp.remote as Record<string, unknown>;
      const headers = remote.headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer bearer-token-456");

      delete process.env.TEST_AUTH_TOKEN;
    });

    it("should use empty string for missing environment variables", async () => {
      delete process.env.NONEXISTENT_VAR;

      const definition: AgentDefinition = {
        name: "test",
        systemPrompt: "Test",
        mcpServers: {
          test: {
            type: "stdio",
            command: "npx",
            env: {
              VAR: "${NONEXISTENT_VAR}",
            },
          },
        },
      };

      const config = await adapter.generate(definition, context);

      const mcp = config.mcp as Record<string, unknown>;
      const test = mcp.test as Record<string, unknown>;
      const environment = test.environment as Record<string, string>;
      expect(environment.VAR).toBe("");
    });
  });

  describe("validate", () => {
    it("should not throw for valid config with mcp and agent sections", async () => {
      const config = {
        mcp: {
          messaging: {
            type: "remote",
            url: "http://host.docker.internal:3100/mcp",
            enabled: true,
          },
        },
        agent: {
          test: {
            prompt: "Test agent",
            mode: "all",
          },
        },
      };

      await expect(adapter.validate(config)).resolves.not.toThrow();
    });

    it("should throw when mcp section is missing", async () => {
      const config = {
        agent: {
          test: {
            prompt: "Test agent",
          },
        },
      };

      await expect(adapter.validate(config)).rejects.toThrow(
        /mcp section is required/i,
      );
    });

    it("should throw when messaging MCP server is missing", async () => {
      const config = {
        mcp: {
          filesystem: {
            type: "local",
            command: ["npx", "-y", "@modelcontextprotocol/server-filesystem"],
          },
        },
        agent: {
          test: {
            prompt: "Test agent",
          },
        },
      };

      await expect(adapter.validate(config)).rejects.toThrow(
        /mcp.messaging is required/i,
      );
    });
  });
});
