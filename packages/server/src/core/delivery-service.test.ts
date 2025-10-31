import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MessageRouter } from "./message-router-jsonl.js";
import { DeliveryService } from "./delivery-service.js";
import { promises as fs } from "fs";
import { DEVELOPER_ID } from "@crowd-mcp/shared";

describe("DeliveryService", () => {
  const testBaseDir = "./test-delivery-service";
  let messageRouter: MessageRouter;
  let deliveryService: DeliveryService;

  // Helper to get mocked console.error calls
  const getMockCalls = () => {
    return (console.error as unknown as { mock: { calls: unknown[][] } }).mock
      .calls;
  };

  beforeEach(async () => {
    // Create a test message router
    messageRouter = new MessageRouter({
      baseDir: testBaseDir,
      sessionId: `test-${Date.now()}`,
    });
    await messageRouter.initialize();

    // Register participants
    messageRouter.registerParticipant(DEVELOPER_ID);
    messageRouter.registerParticipant("agent-test");

    // Create delivery service
    deliveryService = new DeliveryService(messageRouter, {
      recipientId: DEVELOPER_ID,
      checkIntervalMs: 100, // Fast checks for testing
    });

    // Mock console.error to capture output
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(async () => {
    // Stop delivery service
    await deliveryService.stop();

    // Clean up test directory
    try {
      await fs.rm(testBaseDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }

    // Restore console.error
    vi.restoreAllMocks();
  });

  describe("start/stop", () => {
    it("should start the delivery service", async () => {
      await deliveryService.start();

      // Check that console.error was called with startup message
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining("DeliveryService started"),
      );
    });

    it("should stop the delivery service", async () => {
      await deliveryService.start();
      await deliveryService.stop();

      // Check that console.error was called with shutdown message
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining("DeliveryService stopped"),
      );
    });

    it("should not start twice", async () => {
      await deliveryService.start();
      const callCountAfterFirstStart = getMockCalls().length;

      await deliveryService.start();
      const callCountAfterSecondStart = getMockCalls().length;

      // Should not have logged again
      expect(callCountAfterSecondStart).toBe(callCountAfterFirstStart);
    });

    it("should not stop twice", async () => {
      await deliveryService.start();
      await deliveryService.stop();

      const callCountAfterFirstStop = getMockCalls().length;

      await deliveryService.stop();
      const callCountAfterSecondStop = getMockCalls().length;

      // Should not have logged again
      expect(callCountAfterSecondStop).toBe(callCountAfterFirstStop);
    });
  });

  describe("message notification", () => {
    it("should notify when a new message arrives", async () => {
      // Start the service
      await deliveryService.start();

      // Clear previous console calls
      vi.clearAllMocks();

      // Send a message to the developer
      await messageRouter.send({
        from: "agent-test",
        to: DEVELOPER_ID,
        content: "Hello developer!",
        priority: "normal",
      });

      // Wait for the check interval
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Check that notification was logged
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining("You've got mail"),
      );
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining("agent-test"),
      );
    });

    it("should show message preview in notification", async () => {
      // Start the service
      await deliveryService.start();

      // Clear previous console calls
      vi.clearAllMocks();

      // Send a message to the developer
      await messageRouter.send({
        from: "agent-test",
        to: DEVELOPER_ID,
        content: "This is a test message with some content",
        priority: "high",
      });

      // Wait for the check interval
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Check that preview was included
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining("This is a test message"),
      );
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining("Priority: high"),
      );
    });

    it("should notify about multiple messages", async () => {
      // Start the service
      await deliveryService.start();

      // Clear previous console calls
      vi.clearAllMocks();

      // Send multiple messages to the developer
      await messageRouter.send({
        from: "agent-test",
        to: DEVELOPER_ID,
        content: "Message 1",
        priority: "normal",
      });
      await messageRouter.send({
        from: "agent-test",
        to: DEVELOPER_ID,
        content: "Message 2",
        priority: "high",
      });

      // Wait for the check interval
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Check that notification includes count
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining("2 new messages"),
      );
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining("1 high priority"),
      );
    });

    it("should not notify about messages to other recipients", async () => {
      // Start the service
      await deliveryService.start();

      // Register another participant
      messageRouter.registerParticipant("agent-other");

      // Clear previous console calls
      vi.clearAllMocks();

      // Send a message to a different recipient
      await messageRouter.send({
        from: DEVELOPER_ID,
        to: "agent-other",
        content: "Message for someone else",
        priority: "normal",
      });

      // Wait for the check interval
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Should not have notified
      const errorCalls = getMockCalls();
      const hasMailNotification = errorCalls.some(
        (call) =>
          typeof call[0] === "string" && call[0].includes("You've got mail"),
      );
      expect(hasMailNotification).toBe(false);
    });

    it("should not notify about already read messages", async () => {
      // Send a message before starting the service
      const message = await messageRouter.send({
        from: "agent-test",
        to: DEVELOPER_ID,
        content: "Old message",
        priority: "normal",
      });

      // Mark as read
      await messageRouter.markAsRead([message.id]);

      // Start the service
      await deliveryService.start();

      // Clear previous console calls
      vi.clearAllMocks();

      // Wait for the check interval
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Should not have notified
      const errorCalls = getMockCalls();
      const hasMailNotification = errorCalls.some(
        (call) =>
          typeof call[0] === "string" && call[0].includes("You've got mail"),
      );
      expect(hasMailNotification).toBe(false);
    });
  });

  describe("message formatting", () => {
    it("should truncate long message previews", async () => {
      // Start the service
      await deliveryService.start();

      // Clear previous console calls
      vi.clearAllMocks();

      // Send a long message
      const longContent = "A".repeat(150);
      await messageRouter.send({
        from: "agent-test",
        to: DEVELOPER_ID,
        content: longContent,
        priority: "normal",
      });

      // Wait for the check interval
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Check that message was truncated
      const errorCalls = getMockCalls();
      const previewCall = errorCalls.find(
        (call) => typeof call[0] === "string" && call[0].includes("AAAA"),
      );
      expect(previewCall).toBeDefined();
      if (previewCall && typeof previewCall[0] === "string") {
        expect(previewCall[0]).toContain("...");
      }
    });

    it("should format timestamp as 'just now' for recent messages", async () => {
      // Start the service
      await deliveryService.start();

      // Clear previous console calls
      vi.clearAllMocks();

      // Send a message
      await messageRouter.send({
        from: "agent-test",
        to: DEVELOPER_ID,
        content: "Recent message",
        priority: "normal",
      });

      // Wait for the check interval
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Check that timestamp shows "just now"
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining("just now"),
      );
    });
  });
});
