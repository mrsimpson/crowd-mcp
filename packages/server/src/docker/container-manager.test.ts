import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { ContainerManager } from "./container-manager.js";
import type Dockerode from "dockerode";
import { mkdir, writeFile, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

// Mock dockerode
vi.mock("dockerode");

describe("ContainerManager", () => {
  let manager: ContainerManager;
  let mockDocker: Dockerode;
  let testDir: string;

  beforeEach(async () => {
    mockDocker = {
      createContainer: vi.fn(),
    } as unknown as Dockerode;
    manager = new ContainerManager(mockDocker);

    // Create test directory
    testDir = join(tmpdir(), `crowd-mcp-container-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe("spawnAgent - Legacy Mode (no agentType)", () => {
    it("should create and start a container with correct config", async () => {
      const mockContainer = {
        id: "container-123",
        start: vi.fn().mockResolvedValue(undefined),
      };

      (
        mockDocker.createContainer as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockContainer);

      const agent = await manager.spawnAgent({
        agentId: "agent-1",
        task: "Build login UI",
        workspace: "/home/user/project",
      });

      expect(mockDocker.createContainer).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "agent-agent-1",
          Image: "crowd-mcp-agent:latest",
          Env: expect.arrayContaining([
            "AGENT_ID=agent-1",
            "TASK=Build login UI",
            "AGENT_MCP_URL=http://host.docker.internal:3100/mcp",
            "AGENT_TYPE=default",
            expect.stringContaining("AGENT_CONFIG_BASE64="),
          ]),
          HostConfig: expect.objectContaining({
            Binds: ["/home/user/project:/workspace:rw"],
          }),
          Tty: true,
          OpenStdin: true,
        }),
      );

      expect(mockContainer.start).toHaveBeenCalled();
      expect(agent).toEqual({
        id: "agent-1",
        task: "Build login UI",
        containerId: "container-123",
      });
    });
  });

  describe("spawnAgent - Agent Type Mode", () => {
    it("should pass config as AGENT_CONFIG env variable when agentType is specified", async () => {
      // Create agent definition
      const agentsDir = join(testDir, ".crowd/agents");
      await mkdir(agentsDir, { recursive: true });
      await writeFile(
        join(agentsDir, "architect.yaml"),
        `
name: architect
systemPrompt: You are a software architect
preferredModels:
  - anthropic.claude-sonnet-4
`,
      );

      const mockContainer = {
        id: "container-456",
        start: vi.fn().mockResolvedValue(undefined),
      };

      (
        mockDocker.createContainer as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockContainer);

      const agent = await manager.spawnAgent({
        agentId: "agent-2",
        task: "Design system architecture",
        workspace: testDir,
        agentType: "architect",
      });

      // Should have AGENT_CONFIG_BASE64 in environment
      const createCall = (
        mockDocker.createContainer as ReturnType<typeof vi.fn>
      ).mock.calls[0][0];
      const env = createCall.Env;

      const agentConfigEnv = env.find((e: string) =>
        e.startsWith("AGENT_CONFIG_BASE64="),
      );
      expect(agentConfigEnv).toBeDefined();

      // Parse and verify config (base64 decoded)
      const configBase64 = agentConfigEnv.substring(
        "AGENT_CONFIG_BASE64=".length,
      );
      const configJson = Buffer.from(configBase64, "base64").toString("utf-8");
      const config = JSON.parse(configJson);

      // OpenCode format: agent[name].prompt and agent[name].model
      expect(config.agent.architect.prompt).toBe(
        "You are a software architect",
      );
      expect(config.agent.architect.model).toBe("anthropic.claude-sonnet-4");

      expect(mockContainer.start).toHaveBeenCalled();
      expect(agent.id).toBe("agent-2");
    });

    it("should inject messaging MCP server in AGENT_CONFIG", async () => {
      const agentsDir = join(testDir, ".crowd/agents");
      await mkdir(agentsDir, { recursive: true });
      await writeFile(
        join(agentsDir, "simple.yaml"),
        "name: simple\nsystemPrompt: Simple agent",
      );

      const mockContainer = {
        id: "container-789",
        start: vi.fn().mockResolvedValue(undefined),
      };

      (
        mockDocker.createContainer as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockContainer);

      await manager.spawnAgent({
        agentId: "agent-3",
        task: "Test task",
        workspace: testDir,
        agentType: "simple",
      });

      // Extract AGENT_CONFIG_BASE64 from environment
      const createCall = (
        mockDocker.createContainer as ReturnType<typeof vi.fn>
      ).mock.calls[0][0];
      const env = createCall.Env;
      const agentConfigEnv = env.find((e: string) =>
        e.startsWith("AGENT_CONFIG_BASE64="),
      );
      const configBase64 = agentConfigEnv.substring(
        "AGENT_CONFIG_BASE64=".length,
      );
      const configJson = Buffer.from(configBase64, "base64").toString("utf-8");
      const config = JSON.parse(configJson);

      // OpenCode format: mcp.messaging (not mcpServers.messaging)
      expect(config.mcp.messaging).toBeDefined();
      expect(config.mcp.messaging.type).toBe("remote");
      expect(config.mcp.messaging.url).toContain("3100/mcp");
    });

    it("should throw error when agent definition does not exist", async () => {
      const mockContainer = {
        id: "container-999",
        start: vi.fn().mockResolvedValue(undefined),
      };

      (
        mockDocker.createContainer as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockContainer);

      await expect(
        manager.spawnAgent({
          agentId: "agent-999",
          task: "Test",
          workspace: testDir,
          agentType: "nonexistent",
        }),
      ).rejects.toThrow(/not found/i);
    });

    it("should not mount config directory when agentType is specified", async () => {
      const agentsDir = join(testDir, ".crowd/agents");
      await mkdir(agentsDir, { recursive: true });
      await writeFile(
        join(agentsDir, "test.yaml"),
        "name: test\nsystemPrompt: Test",
      );

      const mockContainer = {
        id: "container-path-test",
        start: vi.fn().mockResolvedValue(undefined),
      };

      (
        mockDocker.createContainer as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockContainer);

      await manager.spawnAgent({
        agentId: "agent-path",
        task: "Test",
        workspace: testDir,
        agentType: "test",
      });

      const createCall = (
        mockDocker.createContainer as ReturnType<typeof vi.fn>
      ).mock.calls[0][0];
      const binds = createCall.HostConfig.Binds;

      // Should only include workspace mount, not config mount
      expect(binds).toHaveLength(1);
      expect(binds[0]).toContain(":/workspace:rw");

      // Config should be in ENV instead
      const env = createCall.Env;
      const hasAgentConfig = env.some((e: string) =>
        e.startsWith("AGENT_CONFIG_BASE64="),
      );
      expect(hasAgentConfig).toBe(true);
    });

    it("should preserve custom MCP servers in AGENT_CONFIG", async () => {
      const agentsDir = join(testDir, ".crowd/agents");
      await mkdir(agentsDir, { recursive: true });
      await writeFile(
        join(agentsDir, "custom.yaml"),
        `
name: custom
systemPrompt: Custom agent
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

      const mockContainer = {
        id: "container-custom",
        start: vi.fn().mockResolvedValue(undefined),
      };

      (
        mockDocker.createContainer as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockContainer);

      await manager.spawnAgent({
        agentId: "agent-custom",
        task: "Test",
        workspace: testDir,
        agentType: "custom",
      });

      // Extract AGENT_CONFIG_BASE64 from environment
      const createCall = (
        mockDocker.createContainer as ReturnType<typeof vi.fn>
      ).mock.calls[0][0];
      const env = createCall.Env;
      const agentConfigEnv = env.find((e: string) =>
        e.startsWith("AGENT_CONFIG_BASE64="),
      );
      const configBase64 = agentConfigEnv.substring(
        "AGENT_CONFIG_BASE64=".length,
      );
      const configJson = Buffer.from(configBase64, "base64").toString("utf-8");
      const config = JSON.parse(configJson);

      // OpenCode format: mcp.* (not mcpServers.*)
      expect(config.mcp.filesystem).toBeDefined();
      expect(config.mcp.github).toBeDefined();
      expect(config.mcp.messaging).toBeDefined();
      expect(Object.keys(config.mcp)).toHaveLength(3);
    });
  });
});
