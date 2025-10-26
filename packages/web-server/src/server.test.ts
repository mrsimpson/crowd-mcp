import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Server } from 'http';
import { createHttpServer } from './server.js';
import type { AgentRegistry } from './registry/agent-registry.js';

describe('HTTP Server Integration', () => {
  let mockRegistry: AgentRegistry;
  let server: Server | null = null;

  beforeEach(() => {
    mockRegistry = {
      syncFromDocker: vi.fn().mockResolvedValue(undefined),
      listAgents: vi.fn().mockReturnValue([]),
      getAgent: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    } as unknown as AgentRegistry;
  });

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => {
        server!.close(() => resolve());
      });
      server = null;
    }
  });

  it('should sync from Docker on startup', async () => {
    server = await createHttpServer(mockRegistry, 0);
    expect(mockRegistry.syncFromDocker).toHaveBeenCalledOnce();
  });

  it('should start listening on specified port', async () => {
    server = await createHttpServer(mockRegistry, 0);
    const address = server.address();

    expect(address).not.toBeNull();
    expect(typeof address).toBe('object');
    if (typeof address === 'object' && address !== null) {
      expect(address.port).toBeGreaterThan(0);
    }
  });

  it('should mount agents API at /api/agents', async () => {
    server = await createHttpServer(mockRegistry, 0);
    const address = server.address();

    if (typeof address === 'object' && address !== null) {
      const port = address.port;
      const response = await fetch(`http://localhost:${port}/api/agents`);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('agents');
    }
  });

  it('should mount events API at /api/events', async () => {
    server = await createHttpServer(mockRegistry, 0);
    const address = server.address();

    if (typeof address === 'object' && address !== null) {
      const port = address.port;
      const controller = new AbortController();

      const responsePromise = fetch(`http://localhost:${port}/api/events`, {
        signal: controller.signal,
      });

      const response = await responsePromise;
      expect(response.headers.get('content-type')).toBe('text/event-stream');

      // Close the connection immediately to prevent timeout
      controller.abort();
    }
  });

  it('should reject with helpful error when port is already in use', async () => {
    // Start first server on a specific port
    const firstServer = await createHttpServer(mockRegistry, 0);
    const address = firstServer.address();

    if (typeof address === 'object' && address !== null) {
      const port = address.port;

      // Try to start second server on same port
      await expect(createHttpServer(mockRegistry, port)).rejects.toThrow(
        `Port ${port} is already in use. Please set a different port using the HTTP_PORT environment variable.`
      );

      // Clean up first server
      await new Promise<void>((resolve) => {
        firstServer.close(() => resolve());
      });
    }
  });
});
