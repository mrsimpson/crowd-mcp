import { describe, it, expect, vi, beforeEach } from "vitest";
import { AgentRegistry } from "./agent-registry.js";
import type Dockerode from "dockerode";

describe("AgentRegistry", () => {
  let registry: AgentRegistry;
  let mockDocker: Dockerode;

  beforeEach(() => {
    mockDocker = {
      listContainers: vi.fn(),
      getContainer: vi.fn(),
    } as unknown as Dockerode;

    registry = new AgentRegistry(mockDocker);
  });

  describe("syncFromDocker", () => {
    it("should load agents from Docker containers with agent- prefix", async () => {
      const mockContainers = [
        {
          Id: "container-abc",
          Names: ["/agent-1234567890"],
          Labels: {
            "crowd-mcp.task": "Build login UI",
          },
          State: "running",
          Created: 1730000000,
        },
        {
          Id: "container-xyz",
          Names: ["/agent-9876543210"],
          Labels: {
            "crowd-mcp.task": "Fix bug #123",
          },
          State: "running",
          Created: 1730000100,
        },
      ];

      (mockDocker.listContainers as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockContainers,
      );

      await registry.syncFromDocker();

      const agents = registry.listAgents();

      expect(agents).toHaveLength(2);
      expect(agents[0]).toMatchObject({
        id: "1234567890",
        task: "Build login UI",
        containerId: "container-abc",
      });
      expect(agents[1]).toMatchObject({
        id: "9876543210",
        task: "Fix bug #123",
        containerId: "container-xyz",
      });
    });

    it("should filter out non-agent containers", async () => {
      const mockContainers = [
        {
          Id: "container-abc",
          Names: ["/agent-123"],
          Labels: { "crowd-mcp.task": "Task 1" },
          State: "running",
        },
        {
          Id: "container-other",
          Names: ["/redis"],
          Labels: {},
          State: "running",
        },
      ];

      (mockDocker.listContainers as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockContainers,
      );

      await registry.syncFromDocker();

      const agents = registry.listAgents();

      expect(agents).toHaveLength(1);
      expect(agents[0].id).toBe("123");
    });

    it("should handle empty container list", async () => {
      (mockDocker.listContainers as ReturnType<typeof vi.fn>).mockResolvedValue(
        [],
      );

      await registry.syncFromDocker();

      const agents = registry.listAgents();

      expect(agents).toHaveLength(0);
    });
  });

  describe("registerAgent", () => {
    it("should emit agent:created event when registering new agent", () => {
      const agent = {
        id: "agent-123",
        task: "Test task",
        containerId: "container-abc",
      };

      const eventSpy = vi.fn();
      registry.on("agent:created", eventSpy);

      registry.registerAgent(agent);

      expect(eventSpy).toHaveBeenCalledWith(agent);
      expect(registry.getAgent("agent-123")).toEqual(agent);
    });
  });

  describe("updateAgent", () => {
    it("should emit agent:updated event when updating agent", () => {
      const agent = {
        id: "agent-123",
        task: "Original task",
        containerId: "container-abc",
      };

      registry.registerAgent(agent);

      const eventSpy = vi.fn();
      registry.on("agent:updated", eventSpy);

      registry.updateAgent("agent-123", { task: "Updated task" });

      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "agent-123",
          task: "Updated task",
        }),
      );
    });
  });

  describe("removeAgent", () => {
    it("should emit agent:removed event when removing agent", () => {
      const agent = {
        id: "agent-123",
        task: "Test task",
        containerId: "container-abc",
      };

      registry.registerAgent(agent);

      const eventSpy = vi.fn();
      registry.on("agent:removed", eventSpy);

      registry.removeAgent("agent-123");

      expect(eventSpy).toHaveBeenCalledWith(agent);
      expect(registry.getAgent("agent-123")).toBeUndefined();
    });
  });
});
