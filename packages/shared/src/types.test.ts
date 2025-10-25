import { describe, it, expect } from 'vitest';
import type { Agent } from './types.js';

describe('Types', () => {
  describe('Agent', () => {
    it('should allow creating a minimal agent object', () => {
      const agent: Agent = {
        id: 'agent-123',
        task: 'Build login UI',
        containerId: 'container-abc',
      };

      expect(agent.id).toBe('agent-123');
      expect(agent.task).toBe('Build login UI');
      expect(agent.containerId).toBe('container-abc');
    });
  });
});
