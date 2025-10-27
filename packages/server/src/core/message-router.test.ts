import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { MessageRouter } from "./message-router-jsonl.js";
import { DEVELOPER_ID, BROADCAST_ID } from "@crowd-mcp/shared";
import { tmpdir } from "os";
import { join } from "path";
import { mkdtemp, rm } from "fs/promises";

describe("MessageRouter - Behavior Tests", () => {
  let router: MessageRouter;
  let tempDir: string;

  beforeEach(async () => {
    // Create temporary directory for test session
    tempDir = await mkdtemp(join(tmpdir(), "msg-router-test-"));

    router = new MessageRouter({
      baseDir: tempDir,
      sessionId: "test-session",
    });
    await router.initialize();
  });

  afterEach(async () => {
    await router.close();
    // Clean up temporary directory
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("System Initialization", () => {
    it("should initialize the messaging system successfully", async () => {
      const stats = await router.getStats();
      expect(stats.totalMessages).toBe(0);
      expect(stats.unreadMessages).toBe(0);
    });

    it("should register participants", () => {
      router.registerParticipant("agent-1");
      router.registerParticipant("agent-2");
      router.registerParticipant(DEVELOPER_ID);

      const participants = router.getRegisteredParticipants();
      expect(participants).toContain("agent-1");
      expect(participants).toContain("agent-2");
      expect(participants).toContain(DEVELOPER_ID);
      expect(participants.length).toBe(3);
    });

    it("should unregister participants", () => {
      router.registerParticipant("agent-1");
      router.registerParticipant("agent-2");
      router.unregisterParticipant("agent-1");

      const participants = router.getRegisteredParticipants();
      expect(participants).not.toContain("agent-1");
      expect(participants).toContain("agent-2");
    });
  });

  describe("Sending and Receiving Direct Messages", () => {
    beforeEach(() => {
      router.registerParticipant("agent-1");
      router.registerParticipant("agent-2");
      router.registerParticipant(DEVELOPER_ID);
    });

    it("should send a message from agent to agent", async () => {
      const message = await router.send({
        from: "agent-1",
        to: "agent-2",
        content: "Hello Agent-2!",
        priority: "normal",
      });

      expect(message.id).toBeDefined();
      expect(message.from).toBe("agent-1");
      expect(message.to).toBe("agent-2");
      expect(message.content).toBe("Hello Agent-2!");
      expect(message.priority).toBe("normal");
      expect(message.read).toBe(false);
      expect(message.timestamp).toBeDefined();
    });

    it("should send a message from agent to developer", async () => {
      const message = await router.send({
        from: "agent-1",
        to: DEVELOPER_ID,
        content: "Need help!",
      });

      expect(message.from).toBe("agent-1");
      expect(message.to).toBe(DEVELOPER_ID);
      expect(message.content).toBe("Need help!");
    });

    it("should send a message from developer to agent", async () => {
      const message = await router.send({
        from: DEVELOPER_ID,
        to: "agent-1",
        content: "Here is guidance",
        priority: "high",
      });

      expect(message.from).toBe(DEVELOPER_ID);
      expect(message.to).toBe("agent-1");
      expect(message.priority).toBe("high");
    });

    it("should receive messages sent to a participant", async () => {
      await router.send({
        from: "agent-1",
        to: "agent-2",
        content: "Message 1",
      });

      await router.send({
        from: DEVELOPER_ID,
        to: "agent-2",
        content: "Message 2",
      });

      const messages = await router.getMessages("agent-2");
      expect(messages.length).toBe(2);
      expect(messages[0].content).toBe("Message 1");
      expect(messages[1].content).toBe("Message 2");
    });

    it("should not receive messages sent to other participants", async () => {
      await router.send({
        from: "agent-1",
        to: "agent-2",
        content: "For Agent-2",
      });

      const messagesForAgent1 = await router.getMessages("agent-1");
      const messagesForAgent2 = await router.getMessages("agent-2");

      expect(messagesForAgent1.length).toBe(0);
      expect(messagesForAgent2.length).toBe(1);
    });
  });

  describe("Broadcast Messages", () => {
    beforeEach(() => {
      router.registerParticipant("agent-1");
      router.registerParticipant("agent-2");
      router.registerParticipant("agent-3");
      router.registerParticipant(DEVELOPER_ID);
    });

    it("should broadcast message to all participants except sender", async () => {
      await router.send({
        from: "agent-1",
        to: BROADCAST_ID,
        content: "Broadcast from Agent-1",
      });

      // Agent-1 (sender) should not receive
      const agent1Messages = await router.getMessages("agent-1");
      expect(agent1Messages.length).toBe(0);

      // All other participants should receive
      const agent2Messages = await router.getMessages("agent-2");
      const agent3Messages = await router.getMessages("agent-3");
      const developerMessages = await router.getMessages(DEVELOPER_ID);

      expect(agent2Messages.length).toBe(1);
      expect(agent2Messages[0].content).toBe("Broadcast from Agent-1");

      expect(agent3Messages.length).toBe(1);
      expect(agent3Messages[0].content).toBe("Broadcast from Agent-1");

      expect(developerMessages.length).toBe(1);
      expect(developerMessages[0].content).toBe("Broadcast from Agent-1");
    });

    it("should broadcast from developer to all agents", async () => {
      await router.send({
        from: DEVELOPER_ID,
        to: BROADCAST_ID,
        content: "Announcement from developer",
      });

      const agent1Messages = await router.getMessages("agent-1");
      const agent2Messages = await router.getMessages("agent-2");
      const agent3Messages = await router.getMessages("agent-3");

      expect(agent1Messages.length).toBe(1);
      expect(agent2Messages.length).toBe(1);
      expect(agent3Messages.length).toBe(1);

      // Developer should not receive own broadcast
      const developerMessages = await router.getMessages(DEVELOPER_ID);
      expect(developerMessages.length).toBe(0);
    });
  });

  describe("Message Priority", () => {
    beforeEach(() => {
      router.registerParticipant("agent-1");
      router.registerParticipant("agent-2");
    });

    it("should sort messages by priority (high > normal > low)", async () => {
      // Send in mixed order
      await router.send({
        from: "agent-1",
        to: "agent-2",
        content: "Low priority",
        priority: "low",
      });

      await router.send({
        from: "agent-1",
        to: "agent-2",
        content: "High priority",
        priority: "high",
      });

      await router.send({
        from: "agent-1",
        to: "agent-2",
        content: "Normal priority",
        priority: "normal",
      });

      const messages = await router.getMessages("agent-2");
      expect(messages.length).toBe(3);
      expect(messages[0].content).toBe("High priority");
      expect(messages[1].content).toBe("Normal priority");
      expect(messages[2].content).toBe("Low priority");
    });

    it("should sort by timestamp within same priority", async () => {
      await router.send({
        from: "agent-1",
        to: "agent-2",
        content: "First normal",
        priority: "normal",
      });

      // Small delay to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 10));

      await router.send({
        from: "agent-1",
        to: "agent-2",
        content: "Second normal",
        priority: "normal",
      });

      const messages = await router.getMessages("agent-2");
      expect(messages.length).toBe(2);
      expect(messages[0].content).toBe("First normal");
      expect(messages[1].content).toBe("Second normal");
    });
  });

  describe("Mark as Read", () => {
    beforeEach(() => {
      router.registerParticipant("agent-1");
      router.registerParticipant("agent-2");
    });

    it("should mark a message as read", async () => {
      const message = await router.send({
        from: "agent-1",
        to: "agent-2",
        content: "Test message",
      });

      expect(message.read).toBe(false);

      await router.markAsRead([message.id]);

      const messages = await router.getMessages("agent-2");
      expect(messages[0].read).toBe(true);
    });

    it("should mark multiple messages as read", async () => {
      const msg1 = await router.send({
        from: "agent-1",
        to: "agent-2",
        content: "Message 1",
      });

      const msg2 = await router.send({
        from: "agent-1",
        to: "agent-2",
        content: "Message 2",
      });

      await router.markAsRead([msg1.id, msg2.id]);

      const messages = await router.getMessages("agent-2");
      expect(messages[0].read).toBe(true);
      expect(messages[1].read).toBe(true);
    });

    it("should filter unread messages only", async () => {
      const msg1 = await router.send({
        from: "agent-1",
        to: "agent-2",
        content: "Read message",
      });

      await router.send({
        from: "agent-1",
        to: "agent-2",
        content: "Unread message",
      });

      await router.markAsRead([msg1.id]);

      const unreadMessages = await router.getMessages("agent-2", {
        unreadOnly: true,
      });

      expect(unreadMessages.length).toBe(1);
      expect(unreadMessages[0].content).toBe("Unread message");
    });
  });

  describe("Message Filtering", () => {
    beforeEach(() => {
      router.registerParticipant("agent-1");
      router.registerParticipant("agent-2");
    });

    it("should limit number of messages returned", async () => {
      await router.send({
        from: "agent-1",
        to: "agent-2",
        content: "Message 1",
      });

      await router.send({
        from: "agent-1",
        to: "agent-2",
        content: "Message 2",
      });

      await router.send({
        from: "agent-1",
        to: "agent-2",
        content: "Message 3",
      });

      const messages = await router.getMessages("agent-2", { limit: 2 });
      expect(messages.length).toBe(2);
    });

    it("should filter messages by timestamp (since)", async () => {
      const _timestamp1 = Date.now();

      await router.send({
        from: "agent-1",
        to: "agent-2",
        content: "Old message",
      });

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 10));
      const timestamp2 = Date.now();

      await router.send({
        from: "agent-1",
        to: "agent-2",
        content: "New message",
      });

      const messages = await router.getMessages("agent-2", {
        since: timestamp2,
      });

      expect(messages.length).toBe(1);
      expect(messages[0].content).toBe("New message");
    });

    it("should combine filters (unread + limit)", async () => {
      const msg1 = await router.send({
        from: "agent-1",
        to: "agent-2",
        content: "Read 1",
      });

      await router.send({
        from: "agent-1",
        to: "agent-2",
        content: "Unread 1",
      });

      await router.send({
        from: "agent-1",
        to: "agent-2",
        content: "Unread 2",
      });

      await router.markAsRead([msg1.id]);

      const messages = await router.getMessages("agent-2", {
        unreadOnly: true,
        limit: 1,
      });

      expect(messages.length).toBe(1);
      expect(messages[0].content).toBe("Unread 1");
    });
  });

  describe("Statistics", () => {
    beforeEach(() => {
      router.registerParticipant("agent-1");
      router.registerParticipant("agent-2");
    });

    it("should track total messages", async () => {
      await router.send({
        from: "agent-1",
        to: "agent-2",
        content: "Message 1",
      });

      await router.send({
        from: "agent-2",
        to: "agent-1",
        content: "Message 2",
      });

      const stats = await router.getStats();
      expect(stats.totalMessages).toBe(2);
    });

    it("should track unread messages", async () => {
      const msg1 = await router.send({
        from: "agent-1",
        to: "agent-2",
        content: "Message 1",
      });

      await router.send({
        from: "agent-2",
        to: "agent-1",
        content: "Message 2",
      });

      await router.markAsRead([msg1.id]);

      const stats = await router.getStats();
      expect(stats.totalMessages).toBe(2);
      expect(stats.unreadMessages).toBe(1);
    });

    it("should track participant count", async () => {
      router.registerParticipant("agent-3");

      const stats = await router.getStats();
      expect(stats.totalParticipants).toBe(3); // agent-1, agent-2, agent-3
    });
  });

  describe("Clear Messages", () => {
    beforeEach(() => {
      router.registerParticipant("agent-1");
      router.registerParticipant("agent-2");
    });

    it("should clear all messages for a participant", async () => {
      await router.send({
        from: "agent-1",
        to: "agent-2",
        content: "Message 1",
      });

      await router.send({
        from: "agent-1",
        to: "agent-2",
        content: "Message 2",
      });

      await router.clearMessages("agent-2");

      const messages = await router.getMessages("agent-2");
      expect(messages.length).toBe(0);
    });

    it("should not affect messages for other participants", async () => {
      await router.send({
        from: "agent-1",
        to: "agent-2",
        content: "For Agent-2",
      });

      await router.send({
        from: "agent-2",
        to: "agent-1",
        content: "For Agent-1",
      });

      await router.clearMessages("agent-2");

      const agent1Messages = await router.getMessages("agent-1");
      expect(agent1Messages.length).toBe(1);
    });
  });
});
