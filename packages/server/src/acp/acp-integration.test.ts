import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ACPClientManager } from './acp-client-manager.js';
import { ACPMessageForwarder } from './acp-message-forwarder.js';

// Mock the ACPContainerClient since we can't test actual Docker containers in unit tests
vi.mock('./acp-container-client.js', () => ({
  ACPContainerClient: vi.fn().mockImplementation((agentId: string, containerId: string) => ({
    agentId,
    containerId,
    initialize: vi.fn().mockResolvedValue(undefined),
    sendPrompt: vi.fn().mockResolvedValue(undefined),
    isHealthy: vi.fn().mockReturnValue(true),
    cleanup: vi.fn().mockResolvedValue(undefined),
  }))
}));

describe('ACP Integration', () => {
  let clientManager: ACPClientManager;
  let messageForwarder: ACPMessageForwarder;

  beforeEach(() => {
    vi.clearAllMocks();
    clientManager = new ACPClientManager();
    messageForwarder = new ACPMessageForwarder(clientManager);
  });

  describe('ACPClientManager', () => {
    it('should create and manage ACP clients', async () => {
      const agentId = 'test-agent-1';
      const containerId = 'container-123';

      // Create client
      const client = await clientManager.createClient(agentId, containerId);
      expect(client).toBeDefined();
      expect(clientManager.hasClient(agentId)).toBe(true);

      // Get client
      const retrievedClient = clientManager.getClient(agentId);
      expect(retrievedClient).toBe(client);

      // Remove client
      await clientManager.removeClient(agentId);
      expect(clientManager.hasClient(agentId)).toBe(false);
    });

    it('should handle client health status', () => {
      const healthStatus = clientManager.getHealthStatus();
      expect(Array.isArray(healthStatus)).toBe(true);
    });

    it('should forward messages to healthy clients', async () => {
      const agentId = 'test-agent-2';
      const containerId = 'container-456';
      const message = {
        content: 'Test message',
        from: 'developer',
        timestamp: new Date()
      };

      // Create client first
      await clientManager.createClient(agentId, containerId);

      // Forward message
      await expect(clientManager.forwardMessage(agentId, message)).resolves.not.toThrow();
    });

    it('should throw error when forwarding to non-existent client', async () => {
      const message = {
        content: 'Test message',
        from: 'developer',
        timestamp: new Date()
      };

      await expect(clientManager.forwardMessage('non-existent', message)).rejects.toThrow();
    });
  });

  describe('ACPMessageForwarder', () => {
    it('should forward messages to agent recipients', async () => {
      const agentId = 'agent-test-1';
      const containerId = 'container-789';
      const message = {
        content: 'Test message content',
        from: 'developer',
        to: agentId,
        timestamp: new Date()
      };

      // Create client first
      await clientManager.createClient(agentId, containerId);

      // Forward message
      await expect(messageForwarder.forwardMessage(message)).resolves.not.toThrow();
    });

    it('should not forward messages to non-agent recipients', async () => {
      const message = {
        content: 'Test message content',
        from: 'agent-1',
        to: 'developer',
        timestamp: new Date()
      };

      // Should not throw, but also should not forward
      await expect(messageForwarder.forwardMessage(message)).resolves.not.toThrow();
    });

    it('should not forward messages to agents without ACP clients', async () => {
      const message = {
        content: 'Test message content',
        from: 'developer',
        to: 'agent-without-client',
        timestamp: new Date()
      };

      // Should not throw, but also should not forward
      await expect(messageForwarder.forwardMessage(message)).resolves.not.toThrow();
    });
  });
});
