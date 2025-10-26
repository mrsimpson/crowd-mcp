import { describe, it, expect, beforeEach, vi } from "vitest";
import { ContainerManager } from "./container-manager.js";
import type Dockerode from "dockerode";

// Mock dockerode
vi.mock("dockerode");

describe("ContainerManager", () => {
  let manager: ContainerManager;
  let mockDocker: Dockerode;

  beforeEach(() => {
    mockDocker = {
      createContainer: vi.fn(),
    } as unknown as Dockerode;
    manager = new ContainerManager(mockDocker);
  });

  describe("spawnAgent", () => {
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
});
