import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { StreamableHttpTransport } from "../src/mcp/streamable-http-transport.js";
import { ServerResponse } from "http";

/**
 * Streamable HTTP Transport Unit Tests
 *
 * Tests the core functionality of the StreamableHttpTransport class:
 * - Session management
 * - HTTP request/response handling
 * - SSE stream creation and management
 * - Message notification delivery
 */
describe("StreamableHttpTransport", () => {
  let transport: StreamableHttpTransport;

  beforeEach(() => {
    transport = new StreamableHttpTransport();
  });

  afterEach(() => {
    // Clean up any active sessions
    const sessions = transport.getActiveSessions();
    for (const session of sessions) {
      transport.terminateSession(session.sessionId);
    }
  });

  describe("Session Management", () => {
    it("should create unique session IDs", () => {
      const sessionId1 = transport.createSession();
      const sessionId2 = transport.createSession();

      expect(sessionId1).toBeDefined();
      expect(sessionId2).toBeDefined();
      expect(sessionId1).not.toBe(sessionId2);
      expect(transport.validateSession(sessionId1)).toBe(true);
      expect(transport.validateSession(sessionId2)).toBe(true);
    });

    it("should validate existing sessions", () => {
      const sessionId = transport.createSession();

      expect(transport.validateSession(sessionId)).toBe(true);
      expect(transport.validateSession("invalid-session")).toBe(false);
    });

    it("should terminate sessions", () => {
      const sessionId = transport.createSession();

      expect(transport.validateSession(sessionId)).toBe(true);
      expect(transport.terminateSession(sessionId)).toBe(true);
      expect(transport.validateSession(sessionId)).toBe(false);
      expect(transport.terminateSession("invalid-session")).toBe(false);
    });

    it("should associate agent ID with session", () => {
      const sessionId = transport.createSession();
      const agentId = "test-agent-123";

      transport.setAgentId(sessionId, agentId);

      const sessions = transport.getActiveSessions();
      const session = sessions.find((s) => s.sessionId === sessionId);
      expect(session?.agentId).toBe(agentId);
    });

    it("should track session activity", () => {
      const sessionId = transport.createSession();
      const sessions = transport.getActiveSessions();
      const session = sessions.find((s) => s.sessionId === sessionId);

      expect(session?.createdAt).toBeDefined();
      expect(session?.lastActivity).toBeDefined();
      expect(session?.createdAt).toBe(session?.lastActivity);
    });
  });

  describe("Request Validation", () => {
    it("should identify initialize requests", () => {
      const initRequest = {
        jsonrpc: "2.0",
        method: "initialize",
        id: 1,
        params: { clientInfo: { name: "test-client" } },
      };

      // Access private method for testing
      const isInitRequest = (transport as any).isInitializeRequest(initRequest);
      expect(isInitRequest).toBe(true);
    });

    it("should identify response-only messages", () => {
      const response = {
        jsonrpc: "2.0",
        result: { success: true },
        id: 1,
      };

      const notification = {
        jsonrpc: "2.0",
        method: "notifications/test",
      };

      const request = {
        jsonrpc: "2.0",
        method: "tools/list",
        id: 1,
      };

      // Access private methods for testing
      const isResponseOnly1 = (transport as any).isResponseOrNotificationOnly(
        response,
      );
      const isResponseOnly2 = (transport as any).isResponseOrNotificationOnly(
        notification,
      );
      const isResponseOnly3 = (transport as any).isResponseOrNotificationOnly(
        request,
      );

      expect(isResponseOnly1).toBe(true);
      expect(isResponseOnly2).toBe(true);
      expect(isResponseOnly3).toBe(false);
    });

    it("should identify requests that need responses", () => {
      const requestWithId = {
        jsonrpc: "2.0",
        method: "tools/list",
        id: 1,
      };

      const notificationWithoutId = {
        jsonrpc: "2.0",
        method: "tools/list",
      };

      const response = {
        jsonrpc: "2.0",
        result: {},
        id: 1,
      };

      // Access private method for testing
      const hasRequests1 = (transport as any).hasRequests(requestWithId);
      const hasRequests2 = (transport as any).hasRequests(
        notificationWithoutId,
      );
      const hasRequests3 = (transport as any).hasRequests(response);

      expect(hasRequests1).toBe(true);
      expect(hasRequests2).toBe(false);
      expect(hasRequests3).toBe(false);
    });
  });

  describe("Event Handling", () => {
    it("should emit events on session lifecycle", () => {
      let sessionCreatedCount = 0;
      let sessionTerminatedCount = 0;

      transport.on("session:created", (session) => {
        sessionCreatedCount++;
        expect(session.sessionId).toBeDefined();
      });

      transport.on("session:terminated", (sessionId) => {
        sessionTerminatedCount++;
        expect(typeof sessionId).toBe("string");
      });

      const sessionId = transport.createSession();
      transport.terminateSession(sessionId);

      // Verify counts after all events
      expect(sessionCreatedCount).toBe(1);
      expect(sessionTerminatedCount).toBe(1);
    });
  });

  describe("Message Notifications", () => {
    it("should notify agents about new messages", () => {
      const agentId = "test-agent-456";
      const sessionId = transport.createSession();
      transport.setAgentId(sessionId, agentId);

      // Mock ServerResponse for SSE stream
      const mockResponse = {
        writeHead: () => {},
        write: () => {},
        end: () => {},
        on: () => {},
      } as any as ServerResponse;

      // Create mock stream
      (transport as any).activeStreams.set(sessionId, mockResponse);

      let eventData: any = null;
      mockResponse.write = (data: string) => {
        eventData = data;
        return true;
      };

      // Send notification
      const messageData = {
        messageId: "msg-123",
        from: "developer",
        priority: "high",
        timestamp: Date.now(),
      };

      transport.notifyMessage(agentId, messageData);

      expect(eventData).toBeDefined();
      expect(eventData).toContain("message_notification");
      expect(eventData).toContain("msg-123");
    });
  });

  describe("Session State", () => {
    it("should return empty list when no sessions exist", () => {
      const sessions = transport.getActiveSessions();
      expect(sessions).toEqual([]);
    });

    it("should return all active sessions", () => {
      const sessionId1 = transport.createSession("agent-1");
      const sessionId2 = transport.createSession("agent-2");

      const sessions = transport.getActiveSessions();
      expect(sessions).toHaveLength(2);

      const session1 = sessions.find((s) => s.sessionId === sessionId1);
      const session2 = sessions.find((s) => s.sessionId === sessionId2);

      expect(session1?.agentId).toBe("agent-1");
      expect(session2?.agentId).toBe("agent-2");
    });
  });
});
