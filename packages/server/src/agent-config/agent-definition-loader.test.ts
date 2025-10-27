import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { AgentDefinitionLoader } from "./agent-definition-loader.js";
import { mkdir, writeFile, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

describe("AgentDefinitionLoader", () => {
  let loader: AgentDefinitionLoader;
  let testDir: string;
  let agentsDir: string;

  beforeEach(async () => {
    loader = new AgentDefinitionLoader();
    testDir = join(tmpdir(), `crowd-mcp-agent-test-${Date.now()}`);
    agentsDir = join(testDir, ".crowd/agents");
    await mkdir(agentsDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe("load", () => {
    it("should load valid agent definition from YAML file", async () => {
      await writeFile(
        join(agentsDir, "architect.yaml"),
        `
name: architect
displayName: Software Architect
systemPrompt: |
  You are a software architect.
preferredModels:
  - anthropic.claude-sonnet-4
  - anthropic.claude-haiku-3-5
llmSettings:
  temperature: 0.7
  reasoningEffort: medium
mcpServers:
  filesystem:
    type: stdio
    command: npx
    args: ["-y", "@modelcontextprotocol/server-filesystem"]
  github:
    type: http
    url: https://api.github.com/mcp
    headers:
      Authorization: Bearer \${GITHUB_TOKEN}
capabilities:
  - architecture
  - design
`,
      );

      const result = await loader.load(testDir, "architect");

      expect(result.name).toBe("architect");
      expect(result.displayName).toBe("Software Architect");
      expect(result.systemPrompt).toBe("You are a software architect.\n");
      expect(result.preferredModels).toEqual([
        "anthropic.claude-sonnet-4",
        "anthropic.claude-haiku-3-5",
      ]);
      expect(result.llmSettings).toEqual({
        temperature: 0.7,
        reasoningEffort: "medium",
      });
      expect(result.mcpServers).toBeDefined();
      expect(result.mcpServers?.filesystem).toEqual({
        type: "stdio",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-filesystem"],
      });
      expect(result.mcpServers?.github).toEqual({
        type: "http",
        url: "https://api.github.com/mcp",
        headers: {
          Authorization: "Bearer ${GITHUB_TOKEN}",
        },
      });
      expect(result.capabilities).toEqual(["architecture", "design"]);
    });

    it("should load minimal agent definition with only required fields", async () => {
      await writeFile(
        join(agentsDir, "simple.yaml"),
        `
name: simple
systemPrompt: Simple agent
`,
      );

      const result = await loader.load(testDir, "simple");

      expect(result.name).toBe("simple");
      expect(result.systemPrompt).toBe("Simple agent");
      expect(result.preferredModels).toBeUndefined();
      expect(result.llmSettings).toBeUndefined();
      expect(result.mcpServers).toBeUndefined();
      expect(result.capabilities).toBeUndefined();
    });

    it("should throw error when agent file does not exist", async () => {
      await expect(loader.load(testDir, "nonexistent")).rejects.toThrow(
        /not found/i,
      );
    });

    it("should throw error when YAML is invalid", async () => {
      await writeFile(
        join(agentsDir, "invalid.yaml"),
        `
name: invalid
  invalid indentation
systemPrompt: test
`,
      );

      await expect(loader.load(testDir, "invalid")).rejects.toThrow();
    });

    it("should throw error when name field is missing", async () => {
      await writeFile(
        join(agentsDir, "no-name.yaml"),
        `
systemPrompt: test
`,
      );

      await expect(loader.load(testDir, "no-name")).rejects.toThrow(
        "Agent definition requires 'name' field (string)",
      );
    });

    it("should throw error when systemPrompt field is missing", async () => {
      await writeFile(
        join(agentsDir, "no-prompt.yaml"),
        `
name: no-prompt
`,
      );

      await expect(loader.load(testDir, "no-prompt")).rejects.toThrow(
        "Agent definition requires 'systemPrompt' field (string)",
      );
    });

    it("should throw error when agent name in file does not match filename", async () => {
      await writeFile(
        join(agentsDir, "mismatch.yaml"),
        `
name: different-name
systemPrompt: test
`,
      );

      await expect(loader.load(testDir, "mismatch")).rejects.toThrow(
        /name mismatch/i,
      );
    });

    it("should handle agent with container settings", async () => {
      await writeFile(
        join(agentsDir, "constrained.yaml"),
        `
name: constrained
systemPrompt: Resource-constrained agent
container:
  memory: 1g
  cpus: 0.5
  user: node
`,
      );

      const result = await loader.load(testDir, "constrained");

      expect(result.container).toEqual({
        memory: "1g",
        cpus: 0.5,
        user: "node",
      });
    });
  });

  describe("list", () => {
    it("should list all available agent definitions", async () => {
      await writeFile(
        join(agentsDir, "architect.yaml"),
        "name: architect\nsystemPrompt: test",
      );
      await writeFile(
        join(agentsDir, "coder.yaml"),
        "name: coder\nsystemPrompt: test",
      );
      await writeFile(
        join(agentsDir, "reviewer.yaml"),
        "name: reviewer\nsystemPrompt: test",
      );

      const result = await loader.list(testDir);

      expect(result).toContain("architect");
      expect(result).toContain("coder");
      expect(result).toContain("reviewer");
      expect(result).toHaveLength(3);
    });

    it("should return empty array when agents directory does not exist", async () => {
      await rm(agentsDir, { recursive: true, force: true });

      const result = await loader.list(testDir);

      expect(result).toEqual([]);
    });

    it("should ignore non-YAML files", async () => {
      await writeFile(
        join(agentsDir, "agent1.yaml"),
        "name: agent1\nsystemPrompt: test",
      );
      await writeFile(join(agentsDir, "readme.md"), "# README");
      await writeFile(join(agentsDir, "config.json"), "{}");

      const result = await loader.list(testDir);

      expect(result).toEqual(["agent1"]);
    });

    it("should handle .yml extension", async () => {
      await writeFile(
        join(agentsDir, "agent1.yml"),
        "name: agent1\nsystemPrompt: test",
      );

      const result = await loader.list(testDir);

      expect(result).toContain("agent1");
    });
  });

  describe("exists", () => {
    it("should return true when agent definition exists", async () => {
      await writeFile(
        join(agentsDir, "existing.yaml"),
        "name: existing\nsystemPrompt: test",
      );

      const result = await loader.exists(testDir, "existing");

      expect(result).toBe(true);
    });

    it("should return false when agent definition does not exist", async () => {
      const result = await loader.exists(testDir, "nonexistent");

      expect(result).toBe(false);
    });

    it("should return false when agents directory does not exist", async () => {
      await rm(agentsDir, { recursive: true, force: true });

      const result = await loader.exists(testDir, "any");

      expect(result).toBe(false);
    });
  });
});
