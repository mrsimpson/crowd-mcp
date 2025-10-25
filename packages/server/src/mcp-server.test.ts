import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from './mcp-server.js';
import type { ContainerManager } from './docker/container-manager.js';
import type { AgentRegistry } from '@crowd-mcp/web-server';

describe('McpServer', () => {
  let server: McpServer;
  let mockContainerManager: ContainerManager;
  let mockRegistry: AgentRegistry;

  beforeEach(() => {
    mockContainerManager = {
      spawnAgent: vi.fn(),
    } as unknown as ContainerManager;

    mockRegistry = {
      registerAgent: vi.fn(),
    } as unknown as AgentRegistry;

    server = new McpServer(mockContainerManager, mockRegistry);
  });

  describe('spawn_agent tool', () => {
    it('should call ContainerManager.spawnAgent with correct config', async () => {
      const mockAgent = {
        id: 'agent-123',
        task: 'Build login UI',
        containerId: 'container-abc',
      };

      (mockContainerManager.spawnAgent as ReturnType<typeof vi.fn>).mockResolvedValue(mockAgent);

      const result = await server.handleSpawnAgent('Build login UI');

      expect(mockContainerManager.spawnAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          task: 'Build login UI',
          workspace: expect.any(String),
          agentId: expect.stringMatching(/^agent-\d+$/),
        })
      );

      expect(result).toEqual({
        agentId: mockAgent.id,
        task: mockAgent.task,
        containerId: mockAgent.containerId,
      });
    });

    it('should throw error if task is empty', async () => {
      await expect(server.handleSpawnAgent('')).rejects.toThrow('Task cannot be empty');
    });

    it('should propagate errors from ContainerManager', async () => {
      (mockContainerManager.spawnAgent as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Docker not running')
      );

      await expect(server.handleSpawnAgent('Test task')).rejects.toThrow('Docker not running');
    });

    it('should register agent with AgentRegistry after spawning', async () => {
      const mockAgent = {
        id: 'agent-456',
        task: 'Fix bug #123',
        containerId: 'container-xyz',
      };

      (mockContainerManager.spawnAgent as ReturnType<typeof vi.fn>).mockResolvedValue(mockAgent);

      await server.handleSpawnAgent('Fix bug #123');

      expect(mockRegistry.registerAgent).toHaveBeenCalledWith(mockAgent);
    });
  });
});
