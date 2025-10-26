import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MessagingTools } from './messaging-tools.js';
import { MessageRouter } from '../core/message-router-duckdb.js';
import { AgentRegistry } from '@crowd-mcp/web-server';
import { DEVELOPER_ID, BROADCAST_ID } from '@crowd-mcp/shared';
import Dockerode from 'dockerode';

describe('MessagingTools - Behavior Tests', () => {
  let messagingTools: MessagingTools;
  let messageRouter: MessageRouter;
  let registry: AgentRegistry;

  beforeEach(async () => {
    // Setup dependencies
    const docker = new Dockerode();
    registry = new AgentRegistry(docker);
    messageRouter = new MessageRouter({
      dbPath: ':memory:',
      parquetExportInterval: 999999999,
    });
    await messageRouter.initialize();

    // Register developer
    messageRouter.registerParticipant(DEVELOPER_ID);

    // Create messaging tools
    messagingTools = new MessagingTools(messageRouter, registry);
  });

  afterEach(async () => {
    await messageRouter.close();
  });

  describe('send_message tool', () => {
    beforeEach(() => {
      // Register some agents
      registry.registerAgent({
        id: 'agent-1',
        task: 'Test task 1',
        containerId: 'container-1',
      });
      registry.registerAgent({
        id: 'agent-2',
        task: 'Test task 2',
        containerId: 'container-2',
      });

      messageRouter.registerParticipant('agent-1');
      messageRouter.registerParticipant('agent-2');
    });

    it('should send message from developer to specific agent', async () => {
      const result = await messagingTools.sendMessage({
        from: DEVELOPER_ID,
        to: 'agent-1',
        content: 'Please update the documentation',
        priority: 'high',
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBeDefined();
      expect(result.from).toBe(DEVELOPER_ID);
      expect(result.to).toBe('agent-1');

      // Verify message was stored
      const messages = await messageRouter.getMessages('agent-1');
      expect(messages.length).toBe(1);
      expect(messages[0].content).toBe('Please update the documentation');
    });

    it('should send message from agent to developer', async () => {
      const result = await messagingTools.sendMessage({
        from: 'agent-1',
        to: DEVELOPER_ID,
        content: 'I need clarification on requirements',
      });

      expect(result.success).toBe(true);
      expect(result.to).toBe(DEVELOPER_ID);

      // Verify developer received message
      const messages = await messageRouter.getMessages(DEVELOPER_ID);
      expect(messages.length).toBe(1);
      expect(messages[0].from).toBe('agent-1');
    });

    it('should send message from agent to another agent', async () => {
      const result = await messagingTools.sendMessage({
        from: 'agent-1',
        to: 'agent-2',
        content: 'Can you help with the database schema?',
      });

      expect(result.success).toBe(true);

      const messages = await messageRouter.getMessages('agent-2');
      expect(messages.length).toBe(1);
      expect(messages[0].from).toBe('agent-1');
    });

    it('should broadcast message to all participants', async () => {
      const result = await messagingTools.sendMessage({
        from: DEVELOPER_ID,
        to: BROADCAST_ID,
        content: 'System maintenance in 10 minutes',
      });

      expect(result.success).toBe(true);
      expect(result.to).toBe(BROADCAST_ID);
      expect(result.recipientCount).toBe(2); // agent-1 and agent-2

      // All agents should receive
      const agent1Messages = await messageRouter.getMessages('agent-1');
      const agent2Messages = await messageRouter.getMessages('agent-2');

      expect(agent1Messages.length).toBe(1);
      expect(agent2Messages.length).toBe(1);
    });

    it('should reject message to non-existent agent', async () => {
      await expect(
        messagingTools.sendMessage({
          from: DEVELOPER_ID,
          to: 'agent-999',
          content: 'Test',
        })
      ).rejects.toThrow('Recipient agent-999 not found');
    });

    it('should reject message from non-existent agent', async () => {
      await expect(
        messagingTools.sendMessage({
          from: 'agent-999',
          to: DEVELOPER_ID,
          content: 'Test',
        })
      ).rejects.toThrow('Sender agent-999 not found');
    });

    it('should set default priority to normal', async () => {
      const result = await messagingTools.sendMessage({
        from: DEVELOPER_ID,
        to: 'agent-1',
        content: 'Test message',
        // no priority specified
      });

      expect(result.success).toBe(true);

      const messages = await messageRouter.getMessages('agent-1');
      expect(messages[0].priority).toBe('normal');
    });
  });

  describe('get_messages tool', () => {
    beforeEach(async () => {
      registry.registerAgent({
        id: 'agent-1',
        task: 'Test task',
        containerId: 'container-1',
      });

      messageRouter.registerParticipant('agent-1');

      // Send some test messages
      await messageRouter.send({
        from: 'agent-1',
        to: DEVELOPER_ID,
        content: 'Message 1',
        priority: 'normal',
      });

      await messageRouter.send({
        from: 'agent-1',
        to: DEVELOPER_ID,
        content: 'Message 2',
        priority: 'high',
      });
    });

    it('should retrieve messages for developer', async () => {
      const result = await messagingTools.getMessages({
        participantId: DEVELOPER_ID,
      });

      expect(result.success).toBe(true);
      expect(result.messages.length).toBe(2);
      expect(result.count).toBe(2);
    });

    it('should retrieve messages for agent', async () => {
      // Send message to agent
      await messageRouter.send({
        from: DEVELOPER_ID,
        to: 'agent-1',
        content: 'For agent',
      });

      const result = await messagingTools.getMessages({
        participantId: 'agent-1',
      });

      expect(result.success).toBe(true);
      expect(result.messages.length).toBe(1);
      expect(result.messages[0].content).toBe('For agent');
    });

    it('should filter unread messages only', async () => {
      const messages = await messageRouter.getMessages(DEVELOPER_ID);
      await messageRouter.markRead(messages[0].id);

      const result = await messagingTools.getMessages({
        participantId: DEVELOPER_ID,
        unreadOnly: true,
      });

      expect(result.messages.length).toBe(1);
      expect(result.unreadCount).toBe(1);
    });

    it('should limit number of messages', async () => {
      const result = await messagingTools.getMessages({
        participantId: DEVELOPER_ID,
        limit: 1,
      });

      expect(result.messages.length).toBe(1);
      expect(result.count).toBe(1);
    });

    it('should reject for non-existent participant', async () => {
      await expect(
        messagingTools.getMessages({
          participantId: 'non-existent',
        })
      ).rejects.toThrow('Participant non-existent not found');
    });

    it('should mark messages as read after retrieval when markAsRead=true', async () => {
      const result = await messagingTools.getMessages({
        participantId: DEVELOPER_ID,
        markAsRead: true,
      });

      expect(result.success).toBe(true);

      // Check that messages are now marked as read
      const unreadResult = await messagingTools.getMessages({
        participantId: DEVELOPER_ID,
        unreadOnly: true,
      });

      expect(unreadResult.messages.length).toBe(0);
    });
  });

  describe('discover_agents tool', () => {
    beforeEach(() => {
      registry.registerAgent({
        id: 'agent-1',
        task: 'Frontend development',
        containerId: 'container-1',
        status: 'working',
        capabilities: ['react', 'typescript'],
      });

      registry.registerAgent({
        id: 'agent-2',
        task: 'Backend API',
        containerId: 'container-2',
        status: 'idle',
        capabilities: ['node', 'postgresql'],
      });

      messageRouter.registerParticipant('agent-1');
      messageRouter.registerParticipant('agent-2');
    });

    it('should list all active agents', async () => {
      const result = await messagingTools.discoverAgents({});

      expect(result.success).toBe(true);
      expect(result.agents.length).toBe(2);
      expect(result.count).toBe(2);
    });

    it('should include agent details', async () => {
      const result = await messagingTools.discoverAgents({});

      const agent1 = result.agents.find((a) => a.id === 'agent-1');
      expect(agent1).toBeDefined();
      expect(agent1?.task).toBe('Frontend development');
      expect(agent1?.status).toBe('working');
      expect(agent1?.capabilities).toContain('react');
    });

    it('should exclude developer from agent list', async () => {
      const result = await messagingTools.discoverAgents({});

      const developer = result.agents.find((a) => a.id === DEVELOPER_ID);
      expect(developer).toBeUndefined();
    });
  });

  describe('mark_messages_read tool', () => {
    let messageIds: string[];

    beforeEach(async () => {
      registry.registerAgent({
        id: 'agent-1',
        task: 'Test',
        containerId: 'container-1',
      });

      messageRouter.registerParticipant('agent-1');

      // Send messages
      const msg1 = await messageRouter.send({
        from: 'agent-1',
        to: DEVELOPER_ID,
        content: 'Message 1',
      });

      const msg2 = await messageRouter.send({
        from: 'agent-1',
        to: DEVELOPER_ID,
        content: 'Message 2',
      });

      messageIds = [msg1.id, msg2.id];
    });

    it('should mark single message as read', async () => {
      const result = await messagingTools.markMessagesRead({
        messageIds: [messageIds[0]],
      });

      expect(result.success).toBe(true);
      expect(result.markedCount).toBe(1);

      const messages = await messageRouter.getMessages(DEVELOPER_ID);
      expect(messages[0].read).toBe(true);
      expect(messages[1].read).toBe(false);
    });

    it('should mark multiple messages as read', async () => {
      const result = await messagingTools.markMessagesRead({
        messageIds,
      });

      expect(result.success).toBe(true);
      expect(result.markedCount).toBe(2);

      const messages = await messageRouter.getMessages(DEVELOPER_ID);
      expect(messages[0].read).toBe(true);
      expect(messages[1].read).toBe(true);
    });

    it('should handle empty array', async () => {
      const result = await messagingTools.markMessagesRead({
        messageIds: [],
      });

      expect(result.success).toBe(true);
      expect(result.markedCount).toBe(0);
    });
  });
});
