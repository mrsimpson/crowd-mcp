import { describe, it, expect, beforeEach, vi } from "vitest";
import { EventEmitter } from "events";
import { AgentLogStreamer } from "./agent-log-streamer.js";
import type { AgentRegistry } from "../registry/agent-registry.js";
import type Dockerode from "dockerode";

describe("AgentLogStreamer", () => {
  let mockRegistry: AgentRegistry;
  let mockDocker: Dockerode;
  let logStreamer: AgentLogStreamer;

  beforeEach(() => {
    // Create mock registry
    mockRegistry = {
      getAgent: vi.fn(),
    } as unknown as AgentRegistry;

    // Create mock docker
    mockDocker = {
      getContainer: vi.fn(),
    } as unknown as Dockerode;

    logStreamer = new AgentLogStreamer(mockRegistry, mockDocker);
  });

  describe("streamAgentLogs", () => {
    it("should stream logs for an existing agent", async () => {
      const mockAgent = {
        id: "agent-1",
        task: "Test task",
        containerId: "container-123",
      };

      const mockLogStream = new EventEmitter();
      const mockContainer = {
        logs: vi.fn().mockResolvedValue(mockLogStream),
      };

      vi.mocked(mockRegistry.getAgent).mockReturnValue(mockAgent);
      vi.mocked(mockDocker.getContainer).mockReturnValue(
        mockContainer as unknown as Dockerode.Container,
      );

      const stream = await logStreamer.streamAgentLogs("agent-1", 50);

      expect(mockRegistry.getAgent).toHaveBeenCalledWith("agent-1");
      expect(mockDocker.getContainer).toHaveBeenCalledWith("container-123");
      expect(mockContainer.logs).toHaveBeenCalledWith({
        stdout: true,
        stderr: true,
        follow: true,
        tail: 50,
        timestamps: false,
      });
      expect(stream).toBe(mockLogStream);
    });

    it("should use default tail value of 100", async () => {
      const mockAgent = {
        id: "agent-1",
        task: "Test task",
        containerId: "container-123",
      };

      const mockLogStream = new EventEmitter();
      const mockContainer = {
        logs: vi.fn().mockResolvedValue(mockLogStream),
      };

      vi.mocked(mockRegistry.getAgent).mockReturnValue(mockAgent);
      vi.mocked(mockDocker.getContainer).mockReturnValue(
        mockContainer as unknown as Dockerode.Container,
      );

      await logStreamer.streamAgentLogs("agent-1");

      expect(mockContainer.logs).toHaveBeenCalledWith({
        stdout: true,
        stderr: true,
        follow: true,
        tail: 100,
        timestamps: false,
      });
    });

    it("should throw error when agent not found", async () => {
      vi.mocked(mockRegistry.getAgent).mockReturnValue(undefined);

      await expect(logStreamer.streamAgentLogs("nonexistent")).rejects.toThrow(
        "Agent not found",
      );
    });
  });

  describe("getAgentLogs", () => {
    it("should get static logs for an existing agent", async () => {
      const mockAgent = {
        id: "agent-1",
        task: "Test task",
        containerId: "container-123",
      };

      const mockLogs = Buffer.from("test log output");
      const mockContainer = {
        logs: vi.fn().mockResolvedValue(mockLogs),
      };

      vi.mocked(mockRegistry.getAgent).mockReturnValue(mockAgent);
      vi.mocked(mockDocker.getContainer).mockReturnValue(
        mockContainer as unknown as Dockerode.Container,
      );

      const logs = await logStreamer.getAgentLogs("agent-1", 100);

      expect(mockRegistry.getAgent).toHaveBeenCalledWith("agent-1");
      expect(mockDocker.getContainer).toHaveBeenCalledWith("container-123");
      expect(mockContainer.logs).toHaveBeenCalledWith({
        stdout: true,
        stderr: true,
        tail: 100,
        timestamps: false,
      });
      expect(logs).toBe("test log output");
    });

    it("should use default tail value of 0 (all logs)", async () => {
      const mockAgent = {
        id: "agent-1",
        task: "Test task",
        containerId: "container-123",
      };

      const mockLogs = Buffer.from("test log output");
      const mockContainer = {
        logs: vi.fn().mockResolvedValue(mockLogs),
      };

      vi.mocked(mockRegistry.getAgent).mockReturnValue(mockAgent);
      vi.mocked(mockDocker.getContainer).mockReturnValue(
        mockContainer as unknown as Dockerode.Container,
      );

      await logStreamer.getAgentLogs("agent-1");

      expect(mockContainer.logs).toHaveBeenCalledWith({
        stdout: true,
        stderr: true,
        tail: 0,
        timestamps: false,
      });
    });

    it("should throw error when agent not found", async () => {
      vi.mocked(mockRegistry.getAgent).mockReturnValue(undefined);

      await expect(logStreamer.getAgentLogs("nonexistent")).rejects.toThrow(
        "Agent not found",
      );
    });
  });
});
