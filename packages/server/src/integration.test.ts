import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Dockerode from 'dockerode';
import { AgentRegistry } from '@crowd-mcp/web-server';
import { MessageRouter } from './core/message-router-duckdb.js';
import { MessagingTools } from './mcp/messaging-tools.js';
import { ContainerManager } from './docker/container-manager.js';
import { DEVELOPER_ID, BROADCAST_ID } from '@crowd-mcp/shared';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdtemp, rm } from 'fs/promises';

/**
 * End-to-End Integration Tests
 *
 * These tests verify the complete messaging system integration:
 * - MessageRouter with DuckDB
 * - MessagingTools
 * - AgentRegistry integration
 * - Participant registration on agent lifecycle
 */
describe('Messaging System - End-to-End Integration', () => {
  let docker: Dockerode;
  let registry: AgentRegistry;
  let messageRouter: MessageRouter;
  let messagingTools: MessagingTools;
  let containerManager: ContainerManager;
  let tempDir: string;

  beforeAll(async () => {
    // Create temporary directory for test database
    tempDir = await mkdtemp(join(tmpdir(), 'crowd-mcp-e2e-'));

    // Setup components
    docker = new Dockerode();
    registry = new AgentRegistry(docker);
    containerManager = new ContainerManager(docker);

    // Initialize message router with temp database
    messageRouter = new MessageRouter({
      dbPath: join(tempDir, 'messages.db'),
      parquetExportInterval: 999999999, // Disable periodic export
    });
    await messageRouter.initialize();

    // Register developer
    messageRouter.registerParticipant(DEVELOPER_ID);

    // Connect registry events to message router (like in index.ts)
    registry.on('agent:created', (agent) => {
      messageRouter.registerParticipant(agent.id);
    });
    registry.on('agent:removed', (agent) => {
      messageRouter.unregisterParticipant(agent.id);
    });

    // Create messaging tools
    messagingTools = new MessagingTools(messageRouter, registry);
  }, 30000);

  afterAll(async () => {
    // Cleanup
    await messageRouter.close();
    await rm(tempDir, { recursive: true, force: true });
  });

  it('should broadcast message from developer to spawned agents', async () => {
    // Spawn two agents
    const agent1 = await containerManager.spawnAgent({
      agentId: 'agent-test-1',
      task: 'Test agent 1',
      workspace: process.cwd(),
    });

    const agent2 = await containerManager.spawnAgent({
      agentId: 'agent-test-2',
      task: 'Test agent 2',
      workspace: process.cwd(),
    });

    try {
      // Register agents in registry (this triggers participant registration)
      registry.registerAgent(agent1);
      registry.registerAgent(agent2);

      // Wait a bit for event propagation
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify participants are registered
      const participants = messageRouter.getRegisteredParticipants();
      expect(participants).toContain('agent-test-1');
      expect(participants).toContain('agent-test-2');
      expect(participants).toContain(DEVELOPER_ID);

      // Developer sends broadcast message
      const broadcastResult = await messagingTools.sendMessage({
        from: DEVELOPER_ID,
        to: BROADCAST_ID,
        content: 'System announcement: All agents please report status',
        priority: 'high',
      });

      expect(broadcastResult.success).toBe(true);
      expect(broadcastResult.to).toBe(BROADCAST_ID);
      expect(broadcastResult.recipientCount).toBe(2); // Both agents

      // Verify both agents received the message
      const agent1Messages = await messagingTools.getMessages({
        participantId: 'agent-test-1',
      });

      const agent2Messages = await messagingTools.getMessages({
        participantId: 'agent-test-2',
      });

      expect(agent1Messages.messages.length).toBe(1);
      expect(agent1Messages.messages[0].from).toBe(DEVELOPER_ID);
      expect(agent1Messages.messages[0].content).toBe(
        'System announcement: All agents please report status'
      );
      expect(agent1Messages.messages[0].priority).toBe('high');
      expect(agent1Messages.messages[0].read).toBe(false);

      expect(agent2Messages.messages.length).toBe(1);
      expect(agent2Messages.messages[0].content).toBe(
        'System announcement: All agents please report status'
      );

      // Developer should NOT receive own broadcast
      const developerMessages = await messagingTools.getMessages({
        participantId: DEVELOPER_ID,
      });
      expect(developerMessages.messages.length).toBe(0);
    } finally {
      // Cleanup: stop and remove containers
      await registry.stopAgent('agent-test-1').catch(() => {});
      await registry.stopAgent('agent-test-2').catch(() => {});
    }
  }, 60000);

  it('should send message from agent to developer', async () => {
    // Spawn an agent
    const agent = await containerManager.spawnAgent({
      agentId: 'agent-test-3',
      task: 'Test agent 3',
      workspace: process.cwd(),
    });

    try {
      registry.registerAgent(agent);
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Agent sends message to developer
      const messageResult = await messagingTools.sendMessage({
        from: 'agent-test-3',
        to: DEVELOPER_ID,
        content: 'I need help with the API documentation',
        priority: 'normal',
      });

      expect(messageResult.success).toBe(true);
      expect(messageResult.to).toBe(DEVELOPER_ID);

      // Developer receives the message
      const developerMessages = await messagingTools.getMessages({
        participantId: DEVELOPER_ID,
      });

      expect(developerMessages.messages.length).toBeGreaterThan(0);
      const agentMessage = developerMessages.messages.find(
        (m) => m.from === 'agent-test-3'
      );

      expect(agentMessage).toBeDefined();
      expect(agentMessage?.content).toBe(
        'I need help with the API documentation'
      );
      expect(agentMessage?.priority).toBe('normal');
      expect(agentMessage?.read).toBe(false);
    } finally {
      await registry.stopAgent('agent-test-3').catch(() => {});
    }
  }, 60000);

  it('should send message between agents', async () => {
    // Spawn two agents
    const agent1 = await containerManager.spawnAgent({
      agentId: 'agent-test-4',
      task: 'Frontend agent',
      workspace: process.cwd(),
    });

    const agent2 = await containerManager.spawnAgent({
      agentId: 'agent-test-5',
      task: 'Backend agent',
      workspace: process.cwd(),
    });

    try {
      registry.registerAgent(agent1);
      registry.registerAgent(agent2);
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Agent 1 sends message to Agent 2
      const messageResult = await messagingTools.sendMessage({
        from: 'agent-test-4',
        to: 'agent-test-5',
        content: 'What is the API endpoint for user login?',
        priority: 'normal',
      });

      expect(messageResult.success).toBe(true);

      // Agent 2 receives message
      const agent2Messages = await messagingTools.getMessages({
        participantId: 'agent-test-5',
      });

      expect(agent2Messages.messages.length).toBe(1);
      expect(agent2Messages.messages[0].from).toBe('agent-test-4');
      expect(agent2Messages.messages[0].content).toBe(
        'What is the API endpoint for user login?'
      );

      // Agent 2 replies
      const replyResult = await messagingTools.sendMessage({
        from: 'agent-test-5',
        to: 'agent-test-4',
        content: 'The login endpoint is POST /api/auth/login',
        priority: 'normal',
      });

      expect(replyResult.success).toBe(true);

      // Agent 1 receives reply
      const agent1Messages = await messagingTools.getMessages({
        participantId: 'agent-test-4',
      });

      expect(agent1Messages.messages.length).toBe(1);
      expect(agent1Messages.messages[0].from).toBe('agent-test-5');
      expect(agent1Messages.messages[0].content).toBe(
        'The login endpoint is POST /api/auth/login'
      );
    } finally {
      await registry.stopAgent('agent-test-4').catch(() => {});
      await registry.stopAgent('agent-test-5').catch(() => {});
    }
  }, 60000);

  it('should automatically unregister participants when agent is stopped', async () => {
    // Spawn agent
    const agent = await containerManager.spawnAgent({
      agentId: 'agent-test-6',
      task: 'Temporary agent',
      workspace: process.cwd(),
    });

    registry.registerAgent(agent);
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Verify participant is registered
    let participants = messageRouter.getRegisteredParticipants();
    expect(participants).toContain('agent-test-6');

    // Stop agent (triggers agent:removed event)
    await registry.stopAgent('agent-test-6');
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Verify participant is unregistered
    participants = messageRouter.getRegisteredParticipants();
    expect(participants).not.toContain('agent-test-6');
  }, 60000);

  it('should persist messages across restarts', async () => {
    // Send a message
    await messagingTools.sendMessage({
      from: DEVELOPER_ID,
      to: DEVELOPER_ID, // Self-message for testing
      content: 'Persistent test message',
      priority: 'normal',
    });

    // Close and re-open message router
    await messageRouter.close();

    const newMessageRouter = new MessageRouter({
      dbPath: join(tempDir, 'messages.db'),
      parquetExportInterval: 999999999,
    });
    await newMessageRouter.initialize();

    const newMessagingTools = new MessagingTools(newMessageRouter, registry);

    // Verify message still exists
    const messages = await newMessagingTools.getMessages({
      participantId: DEVELOPER_ID,
    });

    const persistedMessage = messages.messages.find(
      (m) => m.content === 'Persistent test message'
    );
    expect(persistedMessage).toBeDefined();

    // Cleanup
    await newMessageRouter.close();

    // Restore original messageRouter reference
    messageRouter = new MessageRouter({
      dbPath: join(tempDir, 'messages.db'),
      parquetExportInterval: 999999999,
    });
    await messageRouter.initialize();
    messagingTools = new MessagingTools(messageRouter, registry);
  }, 60000);

  it('should discover active agents', async () => {
    // Spawn agents with different statuses and capabilities
    const agent1 = await containerManager.spawnAgent({
      agentId: 'agent-test-7',
      task: 'React developer',
      workspace: process.cwd(),
    });

    const agent2 = await containerManager.spawnAgent({
      agentId: 'agent-test-8',
      task: 'Python backend',
      workspace: process.cwd(),
    });

    try {
      registry.registerAgent({
        ...agent1,
        status: 'working',
        capabilities: ['react', 'typescript'],
      });

      registry.registerAgent({
        ...agent2,
        status: 'idle',
        capabilities: ['python', 'fastapi'],
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Discover all agents
      const allAgents = await messagingTools.discoverAgents({});
      expect(allAgents.agents.length).toBeGreaterThanOrEqual(2);

      // Find our test agents
      const reactAgent = allAgents.agents.find(
        (a) => a.id === 'agent-test-7'
      );
      const pythonAgent = allAgents.agents.find(
        (a) => a.id === 'agent-test-8'
      );

      expect(reactAgent).toBeDefined();
      expect(reactAgent?.task).toBe('React developer');
      expect(reactAgent?.status).toBe('working');
      expect(reactAgent?.capabilities).toContain('react');

      expect(pythonAgent).toBeDefined();
      expect(pythonAgent?.task).toBe('Python backend');
      expect(pythonAgent?.status).toBe('idle');

      // Filter by status
      const workingAgents = await messagingTools.discoverAgents({
        status: 'working',
      });
      expect(
        workingAgents.agents.some((a) => a.id === 'agent-test-7')
      ).toBe(true);

      // Filter by capability
      const reactAgents = await messagingTools.discoverAgents({
        capability: 'react',
      });
      expect(reactAgents.agents.some((a) => a.id === 'agent-test-7')).toBe(
        true
      );
    } finally {
      await registry.stopAgent('agent-test-7').catch(() => {});
      await registry.stopAgent('agent-test-8').catch(() => {});
    }
  }, 60000);
});
