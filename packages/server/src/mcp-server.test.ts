import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "./mcp-server.js";
import type { ContainerManager } from "./docker/container-manager.js";
import type { AgentRegistry } from "@crowd-mcp/web-server";

describe("McpServer", () => {
  let server: McpServer;
  let mockContainerManager: ContainerManager;
  let mockRegistry: AgentRegistry;

  beforeEach(() => {
    mockContainerManager = {
      spawnAgent: vi.fn(),
    } as unknown as ContainerManager;

    mockRegistry = {
      registerAgent: vi.fn(),
      listAgents: vi.fn(),
      stopAgent: vi.fn(),
    } as unknown as AgentRegistry;

    server = new McpServer(mockContainerManager, mockRegistry, 3000);
  });

  describe("spawn_agent tool", () => {
    it("should call ContainerManager.spawnAgent with correct config", async () => {
      const mockAgent = {
        id: "agent-123",
        task: "Build login UI",
        containerId: "container-abc",
      };

      (
        mockContainerManager.spawnAgent as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockAgent);

      const result = await server.handleSpawnAgent("Build login UI");

      expect(mockContainerManager.spawnAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          task: "Build login UI",
          workspace: expect.any(String),
          agentId: expect.stringMatching(/^agent-\d+$/),
        }),
      );

      expect(result).toEqual({
        agentId: mockAgent.id,
        task: mockAgent.task,
        containerId: mockAgent.containerId,
        dashboardUrl: "http://localhost:3000",
      });
    });

    it("should throw error if task is empty", async () => {
      await expect(server.handleSpawnAgent("")).rejects.toThrow(
        "Task cannot be empty",
      );
    });

    it("should propagate errors from ContainerManager", async () => {
      (
        mockContainerManager.spawnAgent as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error("Docker not running"));

      await expect(server.handleSpawnAgent("Test task")).rejects.toThrow(
        "Docker not running",
      );
    });

    it("should register agent with AgentRegistry after spawning", async () => {
      const mockAgent = {
        id: "agent-456",
        task: "Fix bug #123",
        containerId: "container-xyz",
      };

      (
        mockContainerManager.spawnAgent as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockAgent);

      await server.handleSpawnAgent("Fix bug #123");

      expect(mockRegistry.registerAgent).toHaveBeenCalledWith(mockAgent);
    });

    it("should include dashboard URL in response", async () => {
      const mockAgent = {
        id: "agent-789",
        task: "Test task",
        containerId: "container-test",
      };

      (
        mockContainerManager.spawnAgent as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockAgent);

      const result = await server.handleSpawnAgent("Test task");

      expect(result.dashboardUrl).toBe("http://localhost:3000");
    });

    it("should use custom port in dashboard URL", async () => {
      const customServer = new McpServer(
        mockContainerManager,
        mockRegistry,
        8080,
      );
      const mockAgent = {
        id: "agent-custom",
        task: "Custom port task",
        containerId: "container-custom",
      };

      (
        mockContainerManager.spawnAgent as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockAgent);

      const result = await customServer.handleSpawnAgent("Custom port task");

      expect(result.dashboardUrl).toBe("http://localhost:8080");
    });
  });

  describe("list_agents tool", () => {
    it("should return list of all active agents", async () => {
      const mockAgents = [
        { id: "agent-1", task: "Task 1", containerId: "container-1" },
        { id: "agent-2", task: "Task 2", containerId: "container-2" },
      ];

      (mockRegistry.listAgents as ReturnType<typeof vi.fn>).mockReturnValue(
        mockAgents,
      );

      const result = await server.handleListAgents();

      expect(mockRegistry.listAgents).toHaveBeenCalledOnce();
      expect(result).toEqual({
        agents: mockAgents,
        count: 2,
      });
    });

    it("should return empty list when no agents running", async () => {
      (mockRegistry.listAgents as ReturnType<typeof vi.fn>).mockReturnValue([]);

      const result = await server.handleListAgents();

      expect(result).toEqual({
        agents: [],
        count: 0,
      });
    });

    it("should propagate errors from AgentRegistry", async () => {
      (mockRegistry.listAgents as ReturnType<typeof vi.fn>).mockImplementation(
        () => {
          throw new Error("Registry error");
        },
      );

      await expect(server.handleListAgents()).rejects.toThrow("Registry error");
    });
  });

  describe("stop_agent tool", () => {
    it("should stop agent successfully", async () => {
      (mockRegistry.stopAgent as ReturnType<typeof vi.fn>).mockResolvedValue(
        undefined,
      );

      const result = await server.handleStopAgent("agent-123");

      expect(mockRegistry.stopAgent).toHaveBeenCalledWith("agent-123");
      expect(result).toEqual({
        success: true,
        agentId: "agent-123",
      });
    });

    it("should throw error if agent ID is empty", async () => {
      await expect(server.handleStopAgent("")).rejects.toThrow(
        "Agent ID cannot be empty",
      );
    });

    it("should propagate errors from AgentRegistry", async () => {
      (mockRegistry.stopAgent as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Agent not found"),
      );

      await expect(server.handleStopAgent("nonexistent-agent")).rejects.toThrow(
        "Agent not found",
      );
    });
  });
});
