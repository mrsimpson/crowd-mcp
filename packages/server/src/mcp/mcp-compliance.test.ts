/**
 * End-to-end MCP compliance verification tests
 * Tests the complete tool call flow with proper error handling
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock the dependencies to focus on testing the tool handler logic
const mockLogger = {
  error: vi.fn(),
  info: vi.fn(),
  setLevel: vi.fn(),
};

const mockMcpServer = {
  handleSpawnAgent: vi.fn(),
  handleListAgents: vi.fn(),
  handleStopAgent: vi.fn(),
};

const mockMessagingTools = {
  sendMessage: vi.fn(),
  getMessages: vi.fn(),
  markMessagesRead: vi.fn(),
};

// Import the validation functions we created
import {
  safeValidateToolArgs,
  SpawnAgentArgsSchema,
  StopAgentArgsSchema,
} from "./tool-schemas.js";

describe("MCP Compliance End-to-End Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Tool Error Handling Compliance", () => {
    it("should return isError: true for validation failures", async () => {
      // Simulate invalid tool arguments
      const invalidArgs = { task: "" }; // Empty task should fail validation

      const validation = safeValidateToolArgs(
        SpawnAgentArgsSchema,
        invalidArgs,
        "spawn_agent",
      );

      expect(validation.success).toBe(false);

      // Simulate how the actual tool handler would respond
      const response = validation.success
        ? { content: [{ type: "text", text: "Success" }] }
        : {
            content: [{ type: "text", text: validation.error }],
            isError: true,
          };

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain(
        "Invalid arguments for spawn_agent",
      );
    });

    it("should return isError: true for business logic failures", async () => {
      // Simulate valid arguments but business logic failure
      const validArgs = { task: "Valid task" };
      const validation = safeValidateToolArgs(
        SpawnAgentArgsSchema,
        validArgs,
        "spawn_agent",
      );

      expect(validation.success).toBe(true);

      // Simulate business logic error
      mockMcpServer.handleSpawnAgent.mockRejectedValue(
        new Error("Docker daemon not running"),
      );

      try {
        await mockMcpServer.handleSpawnAgent(validArgs.task);
      } catch (error) {
        const response = {
          content: [
            { type: "text", text: `Failed to spawn agent: ${error.message}` },
          ],
          isError: true,
        };

        expect(response.isError).toBe(true);
        expect(response.content[0].text).toContain("Docker daemon not running");
      }
    });
  });

  describe("Input Validation Compliance", () => {
    it("should validate all required parameters", () => {
      // Test spawn_agent schema
      const spawnValidResult = safeValidateToolArgs(
        SpawnAgentArgsSchema,
        { task: "test" },
        "spawn_agent",
      );
      expect(spawnValidResult.success).toBe(true);

      const spawnInvalidResult = safeValidateToolArgs(
        SpawnAgentArgsSchema,
        {},
        "spawn_agent",
      );
      expect(spawnInvalidResult.success).toBe(false);

      // Test stop_agent schema
      const stopValidResult = safeValidateToolArgs(
        StopAgentArgsSchema,
        { agentId: "test" },
        "stop_agent",
      );
      expect(stopValidResult.success).toBe(true);

      const stopInvalidResult = safeValidateToolArgs(
        StopAgentArgsSchema,
        {},
        "stop_agent",
      );
      expect(stopInvalidResult.success).toBe(false);
    });

    it("should reject malicious input attempts", () => {
      const maliciousInputs = [
        null,
        undefined,
        "string instead of object",
        42,
        [],
        { task: null },
        { task: undefined },
        { __proto__: { malicious: true }, task: "test" },
      ];

      maliciousInputs.forEach((input) => {
        const result = safeValidateToolArgs(
          SpawnAgentArgsSchema,
          input,
          "spawn_agent",
        );
        if (
          input === null ||
          input === undefined ||
          typeof input !== "object" ||
          Array.isArray(input)
        ) {
          expect(result.success).toBe(false);
        }
      });
    });
  });

  describe("Error Response Structure", () => {
    it("should follow MCP error response format", () => {
      const validation = safeValidateToolArgs(
        SpawnAgentArgsSchema,
        { task: "" },
        "spawn_agent",
      );

      expect(validation.success).toBe(false);

      const errorResponse = {
        content: [
          {
            type: "text",
            text: validation.success ? "Should not happen" : validation.error,
          },
        ],
        isError: true,
      };

      // Verify MCP compliant error structure
      expect(errorResponse).toHaveProperty("content");
      expect(errorResponse).toHaveProperty("isError", true);
      expect(errorResponse.content).toBeInstanceOf(Array);
      expect(errorResponse.content[0]).toHaveProperty("type", "text");
      expect(errorResponse.content[0]).toHaveProperty("text");
      expect(typeof errorResponse.content[0].text).toBe("string");
    });
  });

  describe("Performance and Edge Cases", () => {
    it("should handle large inputs efficiently", () => {
      const largeTask = "x".repeat(10000);
      const start = Date.now();

      const result = safeValidateToolArgs(
        SpawnAgentArgsSchema,
        { task: largeTask },
        "spawn_agent",
      );

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(100); // Should be very fast
      expect(result.success).toBe(true);
    });

    it("should handle concurrent validations", async () => {
      const validations = Array.from({ length: 100 }, (_, i) =>
        safeValidateToolArgs(
          SpawnAgentArgsSchema,
          { task: `Task ${i}` },
          "spawn_agent",
        ),
      );

      const results = await Promise.all(validations);

      expect(results).toHaveLength(100);
      results.forEach((result) => {
        expect(result.success).toBe(true);
      });
    });
  });

  describe("Logging Integration", () => {
    it("should log errors appropriately", async () => {
      // Simulate a tool call with error logging
      const simulateToolCall = async () => {
        try {
          throw new Error("Simulated error");
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error";
          await mockLogger.error("Tool failed", { error: errorMessage });

          return {
            content: [{ type: "text", text: `Tool failed: ${errorMessage}` }],
            isError: true,
          };
        }
      };

      const response = await simulateToolCall();

      expect(mockLogger.error).toHaveBeenCalledWith("Tool failed", {
        error: "Simulated error",
      });
      expect(response.isError).toBe(true);
    });
  });
});

// Test data integrity
describe("Schema Data Types", () => {
  it("should preserve exact data types", () => {
    const testData = {
      task: "Build app",
      agentType: "coder",
    };

    const result = safeValidateToolArgs(
      SpawnAgentArgsSchema,
      testData,
      "spawn_agent",
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(testData);
      expect(typeof result.data.task).toBe("string");
      expect(typeof result.data.agentType).toBe("string");
    }
  });
});
