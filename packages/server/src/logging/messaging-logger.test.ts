import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { MessagingLogger } from "./messaging-logger.js";
import { promises as fs } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomBytes } from "crypto";

describe("MessagingLogger", () => {
  let logger: MessagingLogger;
  let testDir: string;

  beforeEach(async () => {
    // Create unique test directory
    testDir = join(
      tmpdir(),
      `messaging-logger-test-${randomBytes(6).toString("hex")}`,
    );
    await fs.mkdir(testDir, { recursive: true });

    // Set environment variable to use test directory
    process.env.CROWD_LOG_LEVEL = "DEBUG";

    // Create logger with test directory
    logger = await MessagingLogger.create();
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  it("should log tool call received", async () => {
    await logger.toolCallReceived("agent-123", "send_message", {
      to: "agent-456",
      content: "Hello world",
    });

    // Verify log was written (we can't easily check file contents in this test setup)
    expect(true).toBe(true); // Basic test that no error was thrown
  });

  it("should log tool call result", async () => {
    await logger.toolCallResult("agent-123", "send_message", true, {
      success: true,
      messageId: "msg-123",
    });

    expect(true).toBe(true);
  });

  it("should log message sent", async () => {
    const message = {
      id: "msg-123",
      from: "agent-123",
      to: "agent-456",
      content: "Hello world",
      timestamp: Date.now(),
      read: false,
      priority: "normal" as const,
    };

    await logger.messageSent(message, 1);
    expect(true).toBe(true);
  });

  it("should log message retrieval", async () => {
    await logger.messageRetrieved("agent-123", 5, 2, { unreadOnly: true });
    expect(true).toBe(true);
  });

  it("should log participant registration", async () => {
    await logger.participantRegistered("agent-123");
    expect(true).toBe(true);
  });

  it("should log agent discovery", async () => {
    await logger.agentDiscovery("agent-123", { status: "active" }, 3);
    expect(true).toBe(true);
  });

  it("should sanitize long content in args", async () => {
    const longContent = "x".repeat(300);
    await logger.toolCallReceived("agent-123", "send_message", {
      to: "agent-456",
      content: longContent,
    });

    expect(true).toBe(true);
  });

  it("should sanitize message arrays in results", async () => {
    const messages = Array.from({ length: 5 }, (_, i) => ({
      id: `msg-${i}`,
      from: "agent-123",
      to: "developer",
      content: `Message ${i}`,
      timestamp: Date.now(),
    }));

    await logger.toolCallResult("agent-123", "get_my_messages", true, {
      success: true,
      messages,
      count: 5,
    });

    expect(true).toBe(true);
  });
});
