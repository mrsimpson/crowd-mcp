/**
 * Tests for SpawningTools
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { SpawningTools } from "./spawning-tools.js";
import type { ContainerManager } from "../docker/container-manager.js";
import type { AgentRegistry } from "@crowd-mcp/web-server";
import type { MessageRouter } from "../core/message-router-jsonl.js";
import type { AgentDefinition } from "../agent-config/types.js";
import { SpawnTracker } from "../core/spawn-tracker.js";

describe("SpawningTools", () => {
  let spawningTools: SpawningTools;
  let mockContainerManager: ContainerManager;
  let mockAgentRegistry: AgentRegistry;
  let mockMessageRouter: MessageRouter;
  let spawnTracker: SpawnTracker;

  const mockGetAgentConfig = vi.fn();

  beforeEach(() => {
    // Mock ContainerManager
    mockContainerManager = {
      spawnAgent: vi.fn().mockResolvedValue({
        id: "agent-child",
        containerId: "container-123",
        status: "running",
        task: "Test task",
        workspace: "/workspace",
      }),
    } as unknown as ContainerManager;

    // Mock AgentRegistry
    mockAgentRegistry = {
      registerAgent: vi.fn(),
      getAgent: vi.fn(),
    } as unknown as AgentRegistry;

    // Mock MessageRouter
    mockMessageRouter = {
      send: vi.fn().mockResolvedValue({
        id: "msg-123",
        from: "agent-parent",
        to: "agent-child",
        content: "Task message",
        timestamp: new Date(),
      }),
    } as unknown as MessageRouter;

    spawnTracker = new SpawnTracker();

    spawningTools = new SpawningTools(
      mockContainerManager,
      mockAgentRegistry,
      mockMessageRouter,
      spawnTracker,
      mockGetAgentConfig,
    );
  });

  describe("spawnAgent", () => {
    it("should spawn an agent successfully when spawning is enabled", async () => {
      // Mock agent config with spawning enabled
      mockGetAgentConfig.mockResolvedValue({
        name: "test-agent",
        systemPrompt: "Test prompt",
        spawning: {
          enabled: true,
          maxSpawns: 5,
        },
      } as AgentDefinition);

      const result = await spawningTools.spawnAgent({
        parentAgentId: "agent-parent",
        task: "Test task",
        agentType: "test-agent",
        workspace: "/workspace",
      });

      expect(result.success).toBe(true);
      expect(result.agentId).toBe("agent-child");
      expect(result.containerId).toBe("container-123");
      expect(mockContainerManager.spawnAgent).toHaveBeenCalledWith({
        agentId: expect.stringMatching(/^agent-\d+$/),
        task: "Test task",
        workspace: "/workspace",
        agentType: "test-agent",
      });
      expect(spawnTracker.getSpawnCount("agent-parent")).toBe(1);
    });

    it("should reject spawn when spawning is disabled", async () => {
      mockGetAgentConfig.mockResolvedValue({
        name: "test-agent",
        systemPrompt: "Test prompt",
        spawning: {
          enabled: false,
          maxSpawns: 0,
        },
      } as AgentDefinition);

      await expect(
        spawningTools.spawnAgent({
          parentAgentId: "agent-parent",
          task: "Test task",
          agentType: "test-agent",
          workspace: "/workspace",
        }),
      ).rejects.toThrow("Agent agent-parent is not allowed to spawn agents");

      expect(mockContainerManager.spawnAgent).not.toHaveBeenCalled();
      expect(spawnTracker.getSpawnCount("agent-parent")).toBe(0);
    });

    it("should reject spawn when parent has no spawning config", async () => {
      mockGetAgentConfig.mockResolvedValue({
        name: "test-agent",
        systemPrompt: "Test prompt",
        // No spawning config
      } as AgentDefinition);

      await expect(
        spawningTools.spawnAgent({
          parentAgentId: "agent-parent",
          task: "Test task",
          agentType: "test-agent",
          workspace: "/workspace",
        }),
      ).rejects.toThrow("Agent agent-parent is not allowed to spawn agents");

      expect(mockContainerManager.spawnAgent).not.toHaveBeenCalled();
    });

    it("should reject spawn when spawn limit is reached", async () => {
      mockGetAgentConfig.mockResolvedValue({
        name: "test-agent",
        systemPrompt: "Test prompt",
        spawning: {
          enabled: true,
          maxSpawns: 2,
        },
      } as AgentDefinition);

      // Record 2 previous spawns
      spawnTracker.recordSpawn("agent-parent", "agent-1");
      spawnTracker.recordSpawn("agent-parent", "agent-2");

      await expect(
        spawningTools.spawnAgent({
          parentAgentId: "agent-parent",
          task: "Test task",
          agentType: "test-agent",
          workspace: "/workspace",
        }),
      ).rejects.toThrow(
        "Agent agent-parent has reached spawn limit (2/2 spawned)",
      );

      expect(mockContainerManager.spawnAgent).not.toHaveBeenCalled();
    });

    it("should allow spawn when under the limit", async () => {
      mockGetAgentConfig.mockResolvedValue({
        name: "test-agent",
        systemPrompt: "Test prompt",
        spawning: {
          enabled: true,
          maxSpawns: 3,
        },
      } as AgentDefinition);

      // Record 1 previous spawn
      spawnTracker.recordSpawn("agent-parent", "agent-1");

      const result = await spawningTools.spawnAgent({
        parentAgentId: "agent-parent",
        task: "Test task",
        agentType: "test-agent",
        workspace: "/workspace",
      });

      expect(result.success).toBe(true);
      expect(spawnTracker.getSpawnCount("agent-parent")).toBe(2);
    });

    it("should send task to spawned agent via messaging", async () => {
      mockGetAgentConfig.mockResolvedValue({
        name: "test-agent",
        systemPrompt: "Test prompt",
        spawning: {
          enabled: true,
          maxSpawns: 5,
        },
      } as AgentDefinition);

      const result = await spawningTools.spawnAgent({
        parentAgentId: "agent-parent",
        task: "Test task",
        agentType: "test-agent",
        workspace: "/workspace",
      });

      expect(mockMessageRouter.send).toHaveBeenCalledWith(
        expect.objectContaining({
          from: "agent-parent",
          to: result.agentId, // Use the actual spawned agent ID
          content: expect.stringContaining("Test task"),
          priority: "high",
        }),
      );
    });

    it("should register agent in registry", async () => {
      mockGetAgentConfig.mockResolvedValue({
        name: "test-agent",
        systemPrompt: "Test prompt",
        spawning: {
          enabled: true,
          maxSpawns: 5,
        },
      } as AgentDefinition);

      await spawningTools.spawnAgent({
        parentAgentId: "agent-parent",
        task: "Test task",
        agentType: "test-agent",
        workspace: "/workspace",
      });

      expect(mockAgentRegistry.registerAgent).toHaveBeenCalledWith({
        id: "agent-child",
        containerId: "container-123",
        status: "running",
        task: "Test task",
        workspace: "/workspace",
      });
    });

    it("should use default agent type when not specified", async () => {
      mockGetAgentConfig.mockResolvedValue({
        name: "default",
        systemPrompt: "Test prompt",
        spawning: {
          enabled: true,
          maxSpawns: 5,
        },
      } as AgentDefinition);

      await spawningTools.spawnAgent({
        parentAgentId: "agent-parent",
        task: "Test task",
        workspace: "/workspace",
      });

      expect(mockContainerManager.spawnAgent).toHaveBeenCalledWith({
        agentId: expect.stringMatching(/^agent-\d+$/),
        task: "Test task",
        workspace: "/workspace",
        // agentType should be undefined/not included
      });
    });

    it("should return remaining spawns in response", async () => {
      mockGetAgentConfig.mockResolvedValue({
        name: "test-agent",
        systemPrompt: "Test prompt",
        spawning: {
          enabled: true,
          maxSpawns: 5,
        },
      } as AgentDefinition);

      // Record 2 previous spawns
      spawnTracker.recordSpawn("agent-parent", "agent-1");
      spawnTracker.recordSpawn("agent-parent", "agent-2");

      const result = await spawningTools.spawnAgent({
        parentAgentId: "agent-parent",
        task: "Test task",
        workspace: "/workspace",
      });

      expect(result.remainingSpawns).toBe(2); // 5 max - 3 total (2 previous + 1 new)
    });
  });

  describe("getSpawnStatus", () => {
    it("should return spawn status when spawning is enabled", async () => {
      mockGetAgentConfig.mockResolvedValue({
        name: "test-agent",
        systemPrompt: "Test prompt",
        spawning: {
          enabled: true,
          maxSpawns: 5,
        },
      } as AgentDefinition);

      spawnTracker.recordSpawn("agent-parent", "agent-1");
      spawnTracker.recordSpawn("agent-parent", "agent-2");

      const result = await spawningTools.getSpawnStatus({
        agentId: "agent-parent",
      });

      expect(result.canSpawn).toBe(true);
      expect(result.spawned).toBe(2);
      expect(result.maxSpawns).toBe(5);
      expect(result.remainingSpawns).toBe(3);
    });

    it("should return spawn status when spawning is disabled", async () => {
      mockGetAgentConfig.mockResolvedValue({
        name: "test-agent",
        systemPrompt: "Test prompt",
        spawning: {
          enabled: false,
          maxSpawns: 0,
        },
      } as AgentDefinition);

      const result = await spawningTools.getSpawnStatus({
        agentId: "agent-parent",
      });

      expect(result.canSpawn).toBe(false);
      expect(result.spawned).toBe(0);
      expect(result.maxSpawns).toBe(0);
      expect(result.remainingSpawns).toBe(0);
    });

    it("should return spawn status with no spawning config", async () => {
      mockGetAgentConfig.mockResolvedValue({
        name: "test-agent",
        systemPrompt: "Test prompt",
      } as AgentDefinition);

      const result = await spawningTools.getSpawnStatus({
        agentId: "agent-parent",
      });

      expect(result.canSpawn).toBe(false);
      expect(result.spawned).toBe(0);
      expect(result.maxSpawns).toBe(0);
      expect(result.remainingSpawns).toBe(0);
    });
  });

  describe("getToolDefinitions", () => {
    it("should return spawn_agent and get_spawn_status tool definitions", () => {
      const tools = spawningTools.getToolDefinitions();

      expect(tools).toHaveLength(2);
      expect(tools[0].name).toBe("spawn_agent");
      expect(tools[1].name).toBe("get_spawn_status");
    });

    it("should have proper spawn_agent tool schema", () => {
      const tools = spawningTools.getToolDefinitions();
      const spawnTool = tools.find((t) => t.name === "spawn_agent");

      expect(spawnTool).toBeDefined();
      expect(spawnTool?.inputSchema.properties).toHaveProperty("task");
      expect(spawnTool?.inputSchema.properties).toHaveProperty("agentType");
      expect(spawnTool?.inputSchema.properties).toHaveProperty("workspace");
      expect(spawnTool?.inputSchema.required).toContain("task");
    });
  });
});
