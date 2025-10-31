import { describe, it, expect, beforeEach, vi } from "vitest";
import { NotificationService } from "./notification-service.js";
import { MessageRouter } from "../core/message-router-jsonl.js";
import { McpLogger } from "../mcp/mcp-logger.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { DEVELOPER_ID } from "@crowd-mcp/shared";

describe("NotificationService", () => {
  let notificationService: NotificationService;
  let messageRouter: MessageRouter;
  let mockServer: Server;
  let mockLogger: McpLogger;

  beforeEach(() => {
    // Create mock server
    mockServer = {
      notification: vi.fn().mockResolvedValue(undefined),
    } as unknown as Server;

    // Create mock logger
    mockLogger = {
      info: vi.fn().mockResolvedValue(undefined),
      debug: vi.fn().mockResolvedValue(undefined),
      warning: vi.fn().mockResolvedValue(undefined),
      error: vi.fn().mockResolvedValue(undefined),
    } as unknown as McpLogger;

    // Create message router
    messageRouter = new MessageRouter({
      sessionId: `test-${Date.now()}`,
      baseDir: "./.crowd/test-sessions",
    });

    // Create notification service
    notificationService = new NotificationService(
      mockServer,
      messageRouter,
      mockLogger,
      DEVELOPER_ID,
    );
  });

  describe("start()", () => {
    it("should start successfully", async () => {
      await notificationService.start();

      expect(notificationService.isRunning()).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith(
        "NotificationService started",
        expect.objectContaining({
          targetParticipantId: DEVELOPER_ID,
        }),
      );
    });

    it("should not start twice", async () => {
      await notificationService.start();
      await notificationService.start();

      expect(mockLogger.warning).toHaveBeenCalledWith(
        "NotificationService already started",
      );
    });
  });

  describe("stop()", () => {
    it("should stop successfully", async () => {
      await notificationService.start();
      await notificationService.stop();

      expect(notificationService.isRunning()).toBe(false);
      expect(mockLogger.info).toHaveBeenCalledWith(
        "NotificationService stopped",
      );
    });
  });

  describe("message notifications", () => {
    beforeEach(async () => {
      await messageRouter.initialize();
      messageRouter.registerParticipant(DEVELOPER_ID);
      messageRouter.registerParticipant("agent-1");
      await notificationService.start();
    });

    it("should send notification for developer messages", async () => {
      // Send a message to developer
      await messageRouter.send({
        from: "agent-1",
        to: DEVELOPER_ID,
        content: "Test message",
        priority: "normal",
      });

      // Wait for async notification
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockServer.notification).toHaveBeenCalledWith({
        method: "notifications/message",
        params: expect.objectContaining({
          level: "info",
          logger: "crowd-mcp-notifications",
        }),
      });
    });

    it("should send high priority as warning", async () => {
      // Send high priority message
      await messageRouter.send({
        from: "agent-1",
        to: DEVELOPER_ID,
        content: "Urgent message",
        priority: "high",
      });

      // Wait for async notification
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockServer.notification).toHaveBeenCalledWith({
        method: "notifications/message",
        params: expect.objectContaining({
          level: "warning",
        }),
      });
    });

    it("should not send notification for non-developer messages", async () => {
      // Reset mock
      vi.clearAllMocks();

      // Register another agent
      messageRouter.registerParticipant("agent-2");

      // Send message between agents
      await messageRouter.send({
        from: "agent-1",
        to: "agent-2",
        content: "Agent to agent message",
        priority: "normal",
      });

      // Wait for potential notification
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should not have sent notification
      expect(mockServer.notification).not.toHaveBeenCalled();
    });

    it("should handle notification errors gracefully", async () => {
      // Make notification fail
      (mockServer.notification as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Notification failed"),
      );

      // Send message
      await messageRouter.send({
        from: "agent-1",
        to: DEVELOPER_ID,
        content: "Test message",
        priority: "normal",
      });

      // Wait for async notification
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should have logged error
      expect(mockLogger.error).toHaveBeenCalledWith(
        "Failed to send notification",
        expect.objectContaining({
          error: "Notification failed",
        }),
      );
    });
  });
});
