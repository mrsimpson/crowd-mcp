import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createAgentsRouter } from './agents.js';
import type { AgentRegistry } from '../registry/agent-registry.js';

describe('Agents API', () => {
  let app: express.Express;
  let mockRegistry: AgentRegistry;

  beforeEach(() => {
    mockRegistry = {
      listAgents: vi.fn(),
      getAgent: vi.fn(),
    } as unknown as AgentRegistry;

    app = express();
    app.use('/api/agents', createAgentsRouter(mockRegistry));
  });

  describe('GET /api/agents', () => {
    it('should return list of agents', async () => {
      const mockAgents = [
        { id: 'agent-1', task: 'Task 1', containerId: 'container-1' },
        { id: 'agent-2', task: 'Task 2', containerId: 'container-2' },
      ];

      (mockRegistry.listAgents as ReturnType<typeof vi.fn>).mockReturnValue(mockAgents);

      const response = await request(app).get('/api/agents');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ agents: mockAgents });
      expect(mockRegistry.listAgents).toHaveBeenCalled();
    });

    it('should return empty array when no agents', async () => {
      (mockRegistry.listAgents as ReturnType<typeof vi.fn>).mockReturnValue([]);

      const response = await request(app).get('/api/agents');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ agents: [] });
    });
  });

  describe('GET /api/agents/:id', () => {
    it('should return agent when found', async () => {
      const mockAgent = { id: 'agent-1', task: 'Task 1', containerId: 'container-1' };

      (mockRegistry.getAgent as ReturnType<typeof vi.fn>).mockReturnValue(mockAgent);

      const response = await request(app).get('/api/agents/agent-1');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ agent: mockAgent });
      expect(mockRegistry.getAgent).toHaveBeenCalledWith('agent-1');
    });

    it('should return 404 when agent not found', async () => {
      (mockRegistry.getAgent as ReturnType<typeof vi.fn>).mockReturnValue(undefined);

      const response = await request(app).get('/api/agents/nonexistent');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Agent not found' });
    });
  });
});
