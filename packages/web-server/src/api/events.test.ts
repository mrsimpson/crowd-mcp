import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createEventsRouter } from './events.js';
import type { AgentRegistry } from '../registry/agent-registry.js';

describe('Events API (SSE)', () => {
  let app: express.Application;
  let mockRegistry: AgentRegistry;

  beforeEach(() => {
    mockRegistry = {
      on: vi.fn(),
      off: vi.fn(),
      listAgents: vi.fn(),
    } as unknown as AgentRegistry;

    app = express();
    app.use('/api/events', createEventsRouter(mockRegistry));
  });

  it('should set SSE headers correctly', async () => {
    const response = await request(app)
      .get('/api/events')
      .buffer(true)
      .parse((res, callback) => {
        // Stop after receiving headers
        res.destroy();
        callback(null, '');
      });

    expect(response.headers['content-type']).toBe('text/event-stream');
    expect(response.headers['cache-control']).toBe('no-cache');
    expect(response.headers['connection']).toBe('keep-alive');
  });

  it('should register event listeners on AgentRegistry', async () => {
    request(app)
      .get('/api/events')
      .buffer(true)
      .parse((res, callback) => {
        setTimeout(() => {
          res.destroy();
          callback(null, '');
        }, 50);
      })
      .end(() => {});

    // Wait for async setup
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(mockRegistry.on).toHaveBeenCalledWith(
      'agent:created',
      expect.any(Function)
    );
    expect(mockRegistry.on).toHaveBeenCalledWith(
      'agent:updated',
      expect.any(Function)
    );
    expect(mockRegistry.on).toHaveBeenCalledWith(
      'agent:removed',
      expect.any(Function)
    );
  });

  it('should send initial agents list as init event', async () => {
    const mockAgents = [
      { id: 'agent-1', task: 'Task 1', containerId: 'container-1' },
      { id: 'agent-2', task: 'Task 2', containerId: 'container-2' },
    ];

    (mockRegistry.listAgents as ReturnType<typeof vi.fn>).mockReturnValue(
      mockAgents
    );

    let receivedData = '';

    await request(app)
      .get('/api/events')
      .buffer(true)
      .parse((res, callback) => {
        res.on('data', (chunk) => {
          receivedData += chunk.toString();
        });
        setTimeout(() => {
          res.destroy();
          callback(null, receivedData);
        }, 50);
      });

    expect(receivedData).toContain('event: init');
    expect(receivedData).toContain(JSON.stringify({ agents: mockAgents }));
  });

  it('should remove event listeners when client disconnects', async () => {
    const createdHandler = vi.fn();
    const updatedHandler = vi.fn();
    const removedHandler = vi.fn();

    let capturedHandlers: {
      created?: Function;
      updated?: Function;
      removed?: Function;
    } = {};

    (mockRegistry.on as ReturnType<typeof vi.fn>).mockImplementation(
      (event: string, handler: Function) => {
        if (event === 'agent:created') capturedHandlers.created = handler;
        if (event === 'agent:updated') capturedHandlers.updated = handler;
        if (event === 'agent:removed') capturedHandlers.removed = handler;
      }
    );

    await request(app)
      .get('/api/events')
      .buffer(true)
      .parse((res, callback) => {
        setTimeout(() => {
          res.destroy();
          callback(null, '');
        }, 50);
      });

    // Wait for cleanup
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(mockRegistry.off).toHaveBeenCalledWith(
      'agent:created',
      capturedHandlers.created
    );
    expect(mockRegistry.off).toHaveBeenCalledWith(
      'agent:updated',
      capturedHandlers.updated
    );
    expect(mockRegistry.off).toHaveBeenCalledWith(
      'agent:removed',
      capturedHandlers.removed
    );
  });
});
