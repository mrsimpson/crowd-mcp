import { describe, it, expect, beforeEach, vi } from "vitest";
import { McpServer } from "./mcp-server.js";
import type { ContainerManager } from "./docker/container-manager.js";
import type { AgentRegistry } from "@crowd-mcp/web-server";
import type { MessagingTools } from "./mcp/messaging-tools.js";
import type { McpLogger } from "./mcp/mcp-logger.js";

describe("McpServer - spawn_agent ACP Session Requirements", () => {
  let mcpServer: McpServer;
  let mockContainerManager: ContainerManager;
  let mockRegistry: AgentRegistry;
  let mockMessagingTools: MessagingTools;
  let mockLogger: McpLogger;

  beforeEach(() => {
    // Mock dependencies
    mockContainerManager = {
      spawnAgent: vi.fn(),
    } as any;

    mockRegistry = {
      registerAgent: vi.fn(),
    } as any;

    mockMessagingTools = {
      sendMessage: vi.fn().mockResolvedValue(undefined),
    } as any;

    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      warning: vi.fn(),
    } as unknown as McpLogger;

    mcpServer = new McpServer(
      mockContainerManager,
      mockRegistry,
      mockLogger,
      mockMessagingTools,
      3000
    );
  });

  it("should return success when ACP session is established", async () => {
    // Mock successful container spawn with ACP session
    const mockAgent = {
      id: "agent-123",
      task: "test task",
      containerId: "container-123",
    };
    
    (mockContainerManager.spawnAgent as any).mockResolvedValue(mockAgent);

    const result = await mcpServer.handleSpawnAgent("test task", "coder");

    expect(result).toEqual({
      agentId: "agent-123",
      task: "test task",
      containerId: "container-123",
      dashboardUrl: "http://localhost:3000",
    });

    expect(mockContainerManager.spawnAgent).toHaveBeenCalledWith({
      agentId: expect.stringMatching(/^agent-\d+$/),
      task: "test task",
      workspace: process.cwd(),
      agentType: "coder",
    });

    expect(mockRegistry.registerAgent).toHaveBeenCalledWith(mockAgent);
  });

  it("should fail when ACP session establishment fails", async () => {
    // Mock container spawn failure due to ACP session failure
    const acpError = new Error("Failed to establish ACP session for agent agent-123: ACP client creation failed");
    (mockContainerManager.spawnAgent as any).mockRejectedValue(acpError);

    await expect(
      mcpServer.handleSpawnAgent("test task", "coder")
    ).rejects.toThrow("Failed to establish ACP session for agent agent-123");

    // Should not register agent if spawn fails
    expect(mockRegistry.registerAgent).not.toHaveBeenCalled();
  });

  it("should fail when container creation fails", async () => {
    // Mock container creation failure
    const containerError = new Error("Docker container creation failed");
    (mockContainerManager.spawnAgent as any).mockRejectedValue(containerError);

    await expect(
      mcpServer.handleSpawnAgent("test task")
    ).rejects.toThrow("Docker container creation failed");

    expect(mockRegistry.registerAgent).not.toHaveBeenCalled();
  });

  it("should handle empty task validation", async () => {
    await expect(
      mcpServer.handleSpawnAgent("")
    ).rejects.toThrow("Task cannot be empty");

    await expect(
      mcpServer.handleSpawnAgent("   ")
    ).rejects.toThrow("Task cannot be empty");

    expect(mockContainerManager.spawnAgent).not.toHaveBeenCalled();
  });

  it("should pass agentType correctly when provided", async () => {
    const mockAgent = {
      id: "agent-456",
      task: "architect task",
      containerId: "container-456",
    };
    
    (mockContainerManager.spawnAgent as any).mockResolvedValue(mockAgent);

    await mcpServer.handleSpawnAgent("design system", "architect");

    expect(mockContainerManager.spawnAgent).toHaveBeenCalledWith({
      agentId: expect.stringMatching(/^agent-\d+$/),
      task: "design system",
      workspace: process.cwd(),
      agentType: "architect",
    });
  });

  it("should not include agentType when not provided", async () => {
    const mockAgent = {
      id: "agent-789",
      task: "default task",
      containerId: "container-789",
    };
    
    (mockContainerManager.spawnAgent as any).mockResolvedValue(mockAgent);

    await mcpServer.handleSpawnAgent("default task");

    expect(mockContainerManager.spawnAgent).toHaveBeenCalledWith({
      agentId: expect.stringMatching(/^agent-\d+$/),
      task: "default task",
      workspace: process.cwd(),
      // agentType should not be present
    });
  });
});
