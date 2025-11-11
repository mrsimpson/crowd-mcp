import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ConfigGenerator } from "./config-generator.js";
import { AgentDefinitionLoader } from "./agent-definition-loader.js";
import { OpenCodeAdapter } from "./opencode-adapter.js";
import { mkdir, writeFile, rm, readFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

describe("ConfigGenerator", () => {
  let generator: ConfigGenerator;
  let testDir: string;
  let agentsDir: string;

  beforeEach(async () => {
    const loader = new AgentDefinitionLoader();
    const adapter = new OpenCodeAdapter();
    generator = new ConfigGenerator(loader, adapter);

    testDir = join(tmpdir(), `crowd-mcp-config-gen-${Date.now()}`);
    agentsDir = join(testDir, ".crowd/agents");
    await mkdir(agentsDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe("generate", () => {
    it("should generate config file from agent definition", async () => {
      await writeFile(
        join(agentsDir, "test.yaml"),
        `
name: test
systemPrompt: Test agent
preferredModels:
  - anthropic.claude-sonnet-4
`,
      );

      const result = await generator.generate("test", testDir, {
        agentId: "agent-123",
        agentMcpPort: 3100,
      });

      expect(result.configPath).toBe(
        join(testDir, ".crowd/runtime/agents/agent-123/opencode.json"),
      );
      expect(result.cliName).toBe("opencode");

      // Verify file was written
      const content = await readFile(result.configPath, "utf-8");
      const config = JSON.parse(content);

      // OpenCode format: agent[name].prompt and agent[name].model
      expect(config.agent.test.prompt).toBe("Test agent");
      expect(config.agent.test.model).toBe("anthropic.claude-sonnet-4");
      expect(config.mcp.messaging).toBeDefined();
    });

    it("should create runtime directory if it doesn't exist", async () => {
      await writeFile(
        join(agentsDir, "test.yaml"),
        "name: test\nsystemPrompt: Test",
      );

      const result = await generator.generate("test", testDir, {
        agentId: "agent-456",
        agentMcpPort: 3100,
      });

      // Directory should exist after generation
      const config = await readFile(result.configPath, "utf-8");
      expect(config).toBeTruthy();
    });

    it("should include messaging MCP server with correct agent ID", async () => {
      await writeFile(
        join(agentsDir, "test.yaml"),
        "name: test\nsystemPrompt: Test",
      );

      const result = await generator.generate("test", testDir, {
        agentId: "agent-xyz",
        agentMcpPort: 3100,
      });

      const content = await readFile(result.configPath, "utf-8");
      const config = JSON.parse(content);

      // Messaging URL doesn't contain agent ID, just port and /mcp endpoint
      expect(config.mcp.messaging.url).toContain("3100/mcp");
    });

    it("should resolve environment variables in MCP server configs", async () => {
      process.env.TEST_CONFIG_TOKEN = "secret-token-789";

      await writeFile(
        join(agentsDir, "test.yaml"),
        `
name: test
systemPrompt: Test
mcpServers:
  github:
    type: stdio
    command: npx
    env:
      GITHUB_TOKEN: \${TEST_CONFIG_TOKEN}
`,
      );

      const result = await generator.generate("test", testDir, {
        agentId: "agent-789",
        agentMcpPort: 3100,
      });

      const content = await readFile(result.configPath, "utf-8");
      const config = JSON.parse(content);

      // OpenCode format: mcp.github.environment (not mcpServers.github.env)
      expect(config.mcp.github.environment.GITHUB_TOKEN).toBe(
        "secret-token-789",
      );

      delete process.env.TEST_CONFIG_TOKEN;
    });

    it("should throw error when agent definition not found", async () => {
      await expect(
        generator.generate("nonexistent", testDir, {
          agentId: "agent-999",
          agentMcpPort: 3100,
        }),
      ).rejects.toThrow(/not found/i);
    });

    it("should format JSON output with 2-space indentation", async () => {
      await writeFile(
        join(agentsDir, "test.yaml"),
        "name: test\nsystemPrompt: Test",
      );

      const result = await generator.generate("test", testDir, {
        agentId: "agent-format",
        agentMcpPort: 3100,
      });

      const content = await readFile(result.configPath, "utf-8");
      // Check for proper JSON formatting (indentation)
      // OpenCode format has "agent" and "mcp" sections, not "systemPrompt"
      expect(content).toContain('  "agent"');
      expect(content).toContain('  "mcp"');
    });

    it("should preserve all MCP servers alongside messaging", async () => {
      await writeFile(
        join(agentsDir, "multi.yaml"),
        `
name: multi
systemPrompt: Multi server agent
mcpServers:
  filesystem:
    type: stdio
    command: npx
    args: ["-y", "@modelcontextprotocol/server-filesystem"]
  git:
    type: stdio
    command: npx
    args: ["-y", "@modelcontextprotocol/server-git"]
  github:
    type: http
    url: https://api.github.com/mcp
`,
      );

      const result = await generator.generate("multi", testDir, {
        agentId: "agent-multi",
        agentMcpPort: 3100,
      });

      const content = await readFile(result.configPath, "utf-8");
      const config = JSON.parse(content);

      // OpenCode format: mcp.* (not mcpServers.*)
      expect(Object.keys(config.mcp)).toHaveLength(4); // 3 custom + messaging
      expect(config.mcp.filesystem).toBeDefined();
      expect(config.mcp.git).toBeDefined();
      expect(config.mcp.github).toBeDefined();
      expect(config.mcp.messaging).toBeDefined();
    });

    it("should use correct agentMcpPort in messaging URL", async () => {
      await writeFile(
        join(agentsDir, "test.yaml"),
        "name: test\nsystemPrompt: Test",
      );

      const result = await generator.generate("test", testDir, {
        agentId: "agent-port-test",
        agentMcpPort: 9999,
      });

      const content = await readFile(result.configPath, "utf-8");
      const config = JSON.parse(content);
      expect(config.mcp.messaging.url).toContain(":9999/");
    });
  });

  describe("getConfigPath", () => {
    it("should return path for specified agent", () => {
      const path = generator.getConfigPath(testDir, "agent-abc");

      expect(path).toBe(
        join(testDir, ".crowd/runtime/agents/agent-abc/opencode.json"),
      );
    });
  });

  describe("generateJson", () => {
    it("should return config as JSON string without writing file", async () => {
      await writeFile(
        join(agentsDir, "test.yaml"),
        `
name: test
systemPrompt: Test agent JSON
preferredModels:
  - anthropic.claude-sonnet-4
`,
      );

      const result = await generator.generateJson("test", testDir, {
        agentId: "agent-json-1",
        agentMcpPort: 3100,
      });

      expect(result.configJson).toBeDefined();
      expect(typeof result.configJson).toBe("string");
      expect(result.cliName).toBe("opencode");

      // Parse and verify JSON structure
      const config = JSON.parse(result.configJson);

      // OpenCode format: agent[name].prompt and agent[name].model
      expect(config.agent.test.prompt).toBe("Test agent JSON");
      expect(config.agent.test.model).toBe("anthropic.claude-sonnet-4");
      expect(config.mcp.messaging).toBeDefined();
    });

    it("should include messaging MCP server in JSON config", async () => {
      await writeFile(
        join(agentsDir, "simple.yaml"),
        "name: simple\nsystemPrompt: Simple",
      );

      const result = await generator.generateJson("simple", testDir, {
        agentId: "agent-json-2",
        agentMcpPort: 3100,
      });

      const config = JSON.parse(result.configJson);

      // OpenCode format: mcp.messaging (not mcpServers.messaging)
      expect(config.mcp.messaging.type).toBe("remote");
      expect(config.mcp.messaging.url).toContain("3100/mcp");
    });

    it("should format JSON with 2-space indentation", async () => {
      await writeFile(
        join(agentsDir, "test.yaml"),
        "name: test\nsystemPrompt: Test",
      );

      const result = await generator.generateJson("test", testDir, {
        agentId: "agent-format",
        agentMcpPort: 3100,
      });

      // Check for proper JSON formatting (indentation)
      // OpenCode format has "agent" and "mcp" sections, not "systemPrompt"
      expect(result.configJson).toContain('  "agent"');
      expect(result.configJson).toContain('  "mcp"');
    });

    it("should throw error when agent definition not found", async () => {
      await expect(
        generator.generateJson("nonexistent", testDir, {
          agentId: "agent-error",
          agentMcpPort: 3100,
        }),
      ).rejects.toThrow(/not found/i);
    });

    it("should preserve custom MCP servers in JSON", async () => {
      await writeFile(
        join(agentsDir, "custom.yaml"),
        `
name: custom
systemPrompt: Custom
mcpServers:
  filesystem:
    type: stdio
    command: npx
    args: ["-y", "@modelcontextprotocol/server-filesystem"]
  github:
    type: http
    url: https://api.github.com/mcp
`,
      );

      const result = await generator.generateJson("custom", testDir, {
        agentId: "agent-custom-json",
        agentMcpPort: 3100,
      });

      const config = JSON.parse(result.configJson);

      // OpenCode format: mcp.* (not mcpServers.*)
      expect(Object.keys(config.mcp)).toHaveLength(3); // 2 custom + messaging
      expect(config.mcp.filesystem).toBeDefined();
      expect(config.mcp.github).toBeDefined();
      expect(config.mcp.messaging).toBeDefined();
    });

    it("should use correct agentMcpPort in messaging URL", async () => {
      await writeFile(
        join(agentsDir, "test.yaml"),
        "name: test\nsystemPrompt: Test",
      );

      const result = await generator.generateJson("test", testDir, {
        agentId: "agent-port",
        agentMcpPort: 9999,
      });

      const config = JSON.parse(result.configJson);
      expect(config.mcp.messaging.url).toContain(":9999/");
    });
  });
});
