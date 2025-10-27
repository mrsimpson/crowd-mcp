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
            expect.stringContaining("TASK=Build login UI"),
            expect.stringContaining(
              "AGENT_MCP_URL=http://host.docker.internal:3100",
            ),
          ]),
          HostConfig: expect.objectContaining({
            Binds: expect.arrayContaining([
              "/home/user/project:/workspace:rw",
              "/home/user/project/.crowd/opencode:/root/.config/opencode:ro",
            ]),
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
    it("should generate config and mount it when agentType is specified", async () => {
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

      // Should create container with runtime config mount
      expect(mockDocker.createContainer).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "agent-agent-2",
          HostConfig: expect.objectContaining({
            Binds: expect.arrayContaining([
              `${testDir}:/workspace:rw`,
              expect.stringMatching(
                /\.crowd\/runtime\/agents\/agent-2:\/root\/\.config\/opencode:ro$/,
              ),
            ]),
          }),
        }),
      );

      expect(mockContainer.start).toHaveBeenCalled();
      expect(agent.id).toBe("agent-2");
    });

    it("should inject messaging MCP server in generated config", async () => {
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

      // Read generated config to verify messaging server was injected
      const { readFile } = await import("fs/promises");
      const configPath = join(
        testDir,
        ".crowd/runtime/agents/agent-3/opencode.json",
      );
      const configContent = await readFile(configPath, "utf-8");
      const config = JSON.parse(configContent);

      expect(config.mcpServers.messaging).toBeDefined();
      expect(config.mcpServers.messaging.type).toBe("sse");
      expect(config.mcpServers.messaging.url).toContain("agent-3");
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

    it("should use runtime config path when agentType is specified", async () => {
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

      // Should NOT include old .crowd/opencode path
      const hasOldPath = binds.some((b: string) =>
        b.includes(".crowd/opencode:/root/.config/opencode"),
      );
      expect(hasOldPath).toBe(false);

      // Should include new runtime path
      const hasRuntimePath = binds.some((b: string) =>
        b.includes(".crowd/runtime/agents/agent-path"),
      );
      expect(hasRuntimePath).toBe(true);
    });

    it("should preserve custom MCP servers from agent definition", async () => {
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

      // Read generated config
      const { readFile } = await import("fs/promises");
      const configPath = join(
        testDir,
        ".crowd/runtime/agents/agent-custom/opencode.json",
      );
      const configContent = await readFile(configPath, "utf-8");
      const config = JSON.parse(configContent);

      expect(config.mcpServers.filesystem).toBeDefined();
      expect(config.mcpServers.github).toBeDefined();
      expect(config.mcpServers.messaging).toBeDefined();
      expect(Object.keys(config.mcpServers)).toHaveLength(3);
    });
  });
});
