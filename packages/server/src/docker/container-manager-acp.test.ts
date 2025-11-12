import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, writeFile, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { ContainerManager } from "./container-manager.js";
import type { AgentMcpServer } from "../mcp/agent-mcp-server.js";

// Mock Docker
const mockContainer = {
  id: "container-123",
  start: vi.fn().mockResolvedValue(undefined),
};

const mockDocker = {
  createContainer: vi.fn().mockResolvedValue(mockContainer),
};

// Mock AgentMcpServer
const mockAgentMcpServer = {
  createACPClient: vi.fn().mockResolvedValue(undefined),
} as unknown as AgentMcpServer;

describe("ContainerManager - ACP Integration", () => {
  let tempDir: string;
  let containerManager: ContainerManager;

  beforeEach(async () => {
    // Create temporary directory for test
    tempDir = join(tmpdir(), `crowd-mcp-container-acp-test-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });

    // Create .crowd/agents directory
    const agentsDir = join(tempDir, ".crowd", "agents");
    await mkdir(agentsDir, { recursive: true });

    // Reset mocks
    vi.clearAllMocks();

    // Initialize ContainerManager
    containerManager = new ContainerManager(
      mockDocker as any,
      mockAgentMcpServer,
      3100,
    );
  });

  afterEach(async () => {
    // Clean up temporary directory
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("spawnAgent with ACP MCP servers", () => {
    it("should pass ACP MCP servers to AgentMcpServer.createACPClient", async () => {
      // Create agent definition with MCP servers
      const agentPath = join(tempDir, ".crowd", "agents", "test-agent.yaml");
      await writeFile(
        agentPath,
        `name: test-agent
systemPrompt: Test agent
mcpServers:
  filesystem:
    type: stdio
    command: npx
    args:
      - "@modelcontextprotocol/server-filesystem"
`,
      );

      await containerManager.spawnAgent({
        agentId: "test-agent-1",
        task: "Test task",
        workspace: tempDir,
        agentType: "test-agent",
      });

      // Verify container was created
      expect(mockDocker.createContainer).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "agent-test-agent-1",
          Image: "crowd-mcp-agent:latest",
          Env: expect.arrayContaining([
            "AGENT_ID=test-agent-1",
            "TASK=Test task",
            "AGENT_MCP_URL=http://host.docker.internal:3100/mcp",
            "AGENT_TYPE=test-agent",
          ]),
          HostConfig: {
            Binds: [`${tempDir}:/workspace:rw`],
          },
          Tty: true,
          OpenStdin: true,
          AttachStdin: true,
        }),
      );

      // Verify ACP client was created with MCP servers
      expect(mockAgentMcpServer.createACPClient).toHaveBeenCalledWith(
        "test-agent-1",
        "container-123",
        expect.arrayContaining([
          // Messaging server (always included)
          expect.objectContaining({
            name: "messaging",
            type: "http",
            url: "http://host.docker.internal:3100/mcp",
          }),
          // Filesystem server from agent definition
          expect.objectContaining({
            name: "filesystem",
            command: "npx",
            args: ["@modelcontextprotocol/server-filesystem"],
          }),
        ]),
      );
    });

    it("should pass only messaging server when no agent type specified", async () => {
      await containerManager.spawnAgent({
        agentId: "default-agent",
        task: "Default task",
        workspace: tempDir,
        // No agentType specified
      });

      // Verify ACP client was created with only messaging server
      expect(mockAgentMcpServer.createACPClient).toHaveBeenCalledWith(
        "default-agent",
        "container-123",
        expect.arrayContaining([
          expect.objectContaining({
            name: "messaging",
            type: "http",
            url: "http://host.docker.internal:3100/mcp",
          }),
        ]),
      );

      // Should have exactly 1 MCP server (messaging only)
      const mcpServers = (mockAgentMcpServer.createACPClient as any).mock.calls[0][2];
      expect(mcpServers).toHaveLength(1);
    });

    it("should pass only messaging server when agent definition not found", async () => {
      await containerManager.spawnAgent({
        agentId: "nonexistent-agent",
        task: "Test task",
        workspace: tempDir,
        agentType: "nonexistent",
      });

      // Verify ACP client was created with only messaging server
      expect(mockAgentMcpServer.createACPClient).toHaveBeenCalledWith(
        "nonexistent-agent",
        "container-123",
        expect.arrayContaining([
          expect.objectContaining({
            name: "messaging",
            type: "http",
            url: "http://host.docker.internal:3100/mcp",
          }),
        ]),
      );

      // Should have exactly 1 MCP server (messaging only)
      const mcpServers = (mockAgentMcpServer.createACPClient as any).mock.calls[0][2];
      expect(mcpServers).toHaveLength(1);
    });

    it("should handle ACP client creation failure gracefully", async () => {
      // Mock ACP client creation to fail
      (mockAgentMcpServer.createACPClient as any).mockRejectedValueOnce(
        new Error("ACP client creation failed"),
      );

      // Should not throw error - container creation should succeed
      const result = await containerManager.spawnAgent({
        agentId: "test-agent",
        task: "Test task",
        workspace: tempDir,
      });

      expect(result).toEqual({
        id: "test-agent",
        task: "Test task",
        containerId: "container-123",
      });

      // Container should still be created and started
      expect(mockDocker.createContainer).toHaveBeenCalled();
      expect(mockContainer.start).toHaveBeenCalled();
    });

    it("should use custom agent MCP port in messaging server URL", async () => {
      const customContainerManager = new ContainerManager(
        mockDocker as any,
        mockAgentMcpServer,
        9999, // Custom port
      );

      await customContainerManager.spawnAgent({
        agentId: "test-agent",
        task: "Test task",
        workspace: tempDir,
      });

      expect(mockAgentMcpServer.createACPClient).toHaveBeenCalledWith(
        "test-agent",
        "container-123",
        expect.arrayContaining([
          expect.objectContaining({
            name: "messaging",
            url: "http://host.docker.internal:9999/mcp",
          }),
        ]),
      );
    });
  });
});
