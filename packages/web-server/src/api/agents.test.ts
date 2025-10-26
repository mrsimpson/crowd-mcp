import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createAgentsRouter } from "./agents.js";
import type { AgentRegistry } from "../registry/agent-registry.js";

describe("Agents API", () => {
  let app: express.Express;
  let mockRegistry: AgentRegistry;

  beforeEach(() => {
    mockRegistry = {
      listAgents: vi.fn(),
      getAgent: vi.fn(),
      stopAgent: vi.fn(),
      getAgentLogs: vi.fn(),
    } as unknown as AgentRegistry;

    app = express();
    app.use("/api/agents", createAgentsRouter(mockRegistry));
  });

  describe("GET /api/agents", () => {
    it("should return list of agents", async () => {
      const mockAgents = [
        { id: "agent-1", task: "Task 1", containerId: "container-1" },
        { id: "agent-2", task: "Task 2", containerId: "container-2" },
      ];

      (mockRegistry.listAgents as ReturnType<typeof vi.fn>).mockReturnValue(
        mockAgents,
      );

      const response = await request(app).get("/api/agents");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ agents: mockAgents });
      expect(mockRegistry.listAgents).toHaveBeenCalled();
    });

    it("should return empty array when no agents", async () => {
      (mockRegistry.listAgents as ReturnType<typeof vi.fn>).mockReturnValue([]);

      const response = await request(app).get("/api/agents");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ agents: [] });
    });
  });

  describe("GET /api/agents/:id", () => {
    it("should return agent when found", async () => {
      const mockAgent = {
        id: "agent-1",
        task: "Task 1",
        containerId: "container-1",
      };

      (mockRegistry.getAgent as ReturnType<typeof vi.fn>).mockReturnValue(
        mockAgent,
      );

      const response = await request(app).get("/api/agents/agent-1");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ agent: mockAgent });
      expect(mockRegistry.getAgent).toHaveBeenCalledWith("agent-1");
    });

    it("should return 404 when agent not found", async () => {
      (mockRegistry.getAgent as ReturnType<typeof vi.fn>).mockReturnValue(
        undefined,
      );

      const response = await request(app).get("/api/agents/nonexistent");

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: "Agent not found" });
    });
  });

  describe("DELETE /api/agents/:id", () => {
    it("should stop agent successfully", async () => {
      (mockRegistry.stopAgent as ReturnType<typeof vi.fn>).mockResolvedValue(
        undefined,
      );

      const response = await request(app).delete("/api/agents/agent-1");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        message: "Agent stopped successfully",
      });
      expect(mockRegistry.stopAgent).toHaveBeenCalledWith("agent-1");
    });

    it("should return 404 when agent not found", async () => {
      (mockRegistry.stopAgent as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Agent not found"),
      );

      const response = await request(app).delete("/api/agents/nonexistent");

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: "Agent not found" });
    });

    it("should return 500 on Docker error", async () => {
      (mockRegistry.stopAgent as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Docker daemon not responding"),
      );

      const response = await request(app).delete("/api/agents/agent-1");

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: "Docker daemon not responding" });
    });
  });

  describe("GET /api/agents/:id/logs", () => {
    it("should return agent logs successfully", async () => {
      const mockLogs = "Line 1\nLine 2\nLine 3\n";
      (mockRegistry.getAgentLogs as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockLogs,
      );

      const response = await request(app).get("/api/agents/agent-1/logs");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ logs: mockLogs });
      expect(mockRegistry.getAgentLogs).toHaveBeenCalledWith(
        "agent-1",
        undefined,
      );
    });

    it("should return logs with tail parameter", async () => {
      const mockLogs = "Line 98\nLine 99\nLine 100\n";
      (mockRegistry.getAgentLogs as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockLogs,
      );

      const response = await request(app).get(
        "/api/agents/agent-1/logs?tail=100",
      );

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ logs: mockLogs });
      expect(mockRegistry.getAgentLogs).toHaveBeenCalledWith("agent-1", 100);
    });

    it("should return 404 when agent not found", async () => {
      (mockRegistry.getAgentLogs as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Agent not found"),
      );

      const response = await request(app).get("/api/agents/nonexistent/logs");

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: "Agent not found" });
    });

    it("should return 500 on Docker error", async () => {
      (mockRegistry.getAgentLogs as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Container not running"),
      );

      const response = await request(app).get("/api/agents/agent-1/logs");

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: "Container not running" });
    });
  });
});
