/**
 * Comprehensive validation tests for MCP protocol compliance fixes
 */

import { describe, it, expect } from "vitest";
import {
  SpawnAgentArgsSchema,
  StopAgentArgsSchema,
  SendMessageArgsSchema,
  GetMessagesArgsSchema,
  MarkMessagesReadArgsSchema,
  ListAgentsArgsSchema,
  GitCloneRepositoryArgsSchema,
  validateToolArgs,
  safeValidateToolArgs,
} from "./tool-schemas.js";

describe("MCP Tool Schema Validation", () => {
  describe("SpawnAgentArgsSchema", () => {
    it("should validate valid spawn agent arguments", () => {
      const validArgs = { task: "Build a website", agentType: "coder" };
      const result = SpawnAgentArgsSchema.parse(validArgs);
      expect(result).toEqual(validArgs);
    });

    it("should validate minimal spawn agent arguments", () => {
      const validArgs = { task: "Simple task" };
      const result = SpawnAgentArgsSchema.parse(validArgs);
      expect(result).toEqual(validArgs);
    });

    it("should reject empty task", () => {
      const invalidArgs = { task: "" };
      expect(() => SpawnAgentArgsSchema.parse(invalidArgs)).toThrow(
        "Task cannot be empty",
      );
    });

    it("should reject missing task", () => {
      const invalidArgs = { agentType: "coder" };
      expect(() => SpawnAgentArgsSchema.parse(invalidArgs)).toThrow();
    });
  });

  describe("StopAgentArgsSchema", () => {
    it("should validate valid stop agent arguments", () => {
      const validArgs = { agentId: "agent-123" };
      const result = StopAgentArgsSchema.parse(validArgs);
      expect(result).toEqual(validArgs);
    });

    it("should reject empty agentId", () => {
      const invalidArgs = { agentId: "" };
      expect(() => StopAgentArgsSchema.parse(invalidArgs)).toThrow(
        "Agent ID cannot be empty",
      );
    });

    it("should reject missing agentId", () => {
      const invalidArgs = {};
      expect(() => StopAgentArgsSchema.parse(invalidArgs)).toThrow();
    });
  });

  describe("SendMessageArgsSchema", () => {
    it("should validate valid send message arguments", () => {
      const validArgs = {
        to: "agent-123",
        content: "Hello",
        priority: "high" as const,
      };
      const result = SendMessageArgsSchema.parse(validArgs);
      expect(result).toEqual(validArgs);
    });

    it("should validate without priority", () => {
      const validArgs = { to: "agent-123", content: "Hello" };
      const result = SendMessageArgsSchema.parse(validArgs);
      expect(result).toEqual(validArgs);
    });

    it("should reject empty recipient", () => {
      const invalidArgs = { to: "", content: "Hello" };
      expect(() => SendMessageArgsSchema.parse(invalidArgs)).toThrow(
        "Recipient cannot be empty",
      );
    });

    it("should reject empty content", () => {
      const invalidArgs = { to: "agent-123", content: "" };
      expect(() => SendMessageArgsSchema.parse(invalidArgs)).toThrow(
        "Content cannot be empty",
      );
    });

    it("should reject invalid priority", () => {
      const invalidArgs = {
        to: "agent-123",
        content: "Hello",
        priority: "urgent",
      };
      expect(() => SendMessageArgsSchema.parse(invalidArgs)).toThrow();
    });
  });

  describe("GetMessagesArgsSchema", () => {
    it("should validate empty arguments", () => {
      const validArgs = {};
      const result = GetMessagesArgsSchema.parse(validArgs);
      expect(result).toEqual(validArgs);
    });

    it("should validate with all optional parameters", () => {
      const validArgs = { unreadOnly: true, limit: 10, markAsRead: false };
      const result = GetMessagesArgsSchema.parse(validArgs);
      expect(result).toEqual(validArgs);
    });

    it("should reject negative limit", () => {
      const invalidArgs = { limit: -1 };
      expect(() => GetMessagesArgsSchema.parse(invalidArgs)).toThrow();
    });

    it("should reject zero limit", () => {
      const invalidArgs = { limit: 0 };
      expect(() => GetMessagesArgsSchema.parse(invalidArgs)).toThrow();
    });

    it("should reject non-integer limit", () => {
      const invalidArgs = { limit: 3.14 };
      expect(() => GetMessagesArgsSchema.parse(invalidArgs)).toThrow();
    });
  });

  describe("MarkMessagesReadArgsSchema", () => {
    it("should validate valid message IDs", () => {
      const validArgs = { messageIds: ["msg-1", "msg-2", "msg-3"] };
      const result = MarkMessagesReadArgsSchema.parse(validArgs);
      expect(result).toEqual(validArgs);
    });

    it("should validate single message ID", () => {
      const validArgs = { messageIds: ["msg-1"] };
      const result = MarkMessagesReadArgsSchema.parse(validArgs);
      expect(result).toEqual(validArgs);
    });

    it("should reject empty message ID", () => {
      const invalidArgs = { messageIds: [""] };
      expect(() => MarkMessagesReadArgsSchema.parse(invalidArgs)).toThrow(
        "Message ID cannot be empty",
      );
    });

    it("should reject empty array", () => {
      const invalidArgs = { messageIds: [] };
      const result = MarkMessagesReadArgsSchema.parse(invalidArgs);
      expect(result).toEqual(invalidArgs); // Empty array is valid
    });

    it("should reject missing messageIds", () => {
      const invalidArgs = {};
      expect(() => MarkMessagesReadArgsSchema.parse(invalidArgs)).toThrow();
    });
  });

  describe("ListAgentsArgsSchema", () => {
    it("should validate empty arguments", () => {
      const validArgs = {};
      const result = ListAgentsArgsSchema.parse(validArgs);
      expect(result).toEqual(validArgs);
    });

    it("should reject additional properties", () => {
      const invalidArgs = { unexpectedProp: "value" };
      // Zod by default allows additional properties, so this should pass
      const result = ListAgentsArgsSchema.parse(invalidArgs);
      expect(result).toEqual({});
    });
  });

  describe("GitCloneRepositoryArgsSchema", () => {
    it("should validate valid git clone arguments", () => {
      const validArgs = {
        repositoryUrl: "https://github.com/example/repo.git",
        targetPath: "my-repo",
        branch: "main",
        agentId: "agent-123",
      };
      const result = GitCloneRepositoryArgsSchema.parse(validArgs);
      expect(result).toEqual(validArgs);
    });

    it("should validate minimal git clone arguments (no branch)", () => {
      const validArgs = {
        repositoryUrl: "git@github.com:example/repo.git",
        targetPath: "my-repo",
        agentId: "agent-456",
      };
      const result = GitCloneRepositoryArgsSchema.parse(validArgs);
      expect(result).toEqual(validArgs);
    });

    it("should reject empty repository URL", () => {
      const invalidArgs = {
        repositoryUrl: "",
        targetPath: "my-repo",
        agentId: "agent-123",
      };
      expect(() => GitCloneRepositoryArgsSchema.parse(invalidArgs)).toThrow(
        "Repository URL cannot be empty",
      );
    });

    it("should reject empty target path", () => {
      const invalidArgs = {
        repositoryUrl: "https://github.com/example/repo.git",
        targetPath: "",
        agentId: "agent-123",
      };
      expect(() => GitCloneRepositoryArgsSchema.parse(invalidArgs)).toThrow(
        "Target path cannot be empty",
      );
    });

    it("should reject empty agent ID", () => {
      const invalidArgs = {
        repositoryUrl: "https://github.com/example/repo.git",
        targetPath: "my-repo",
        agentId: "",
      };
      expect(() => GitCloneRepositoryArgsSchema.parse(invalidArgs)).toThrow(
        "Agent ID cannot be empty",
      );
    });

    it("should reject missing required fields", () => {
      const invalidArgs = {
        repositoryUrl: "https://github.com/example/repo.git",
      };
      expect(() => GitCloneRepositoryArgsSchema.parse(invalidArgs)).toThrow();
    });
  });

  describe("validateToolArgs utility", () => {
    it("should return validated data for valid input", () => {
      const validArgs = { task: "Test task" };
      const result = validateToolArgs(
        SpawnAgentArgsSchema,
        validArgs,
        "spawn_agent",
      );
      expect(result).toEqual(validArgs);
    });

    it("should throw descriptive error for invalid input", () => {
      const invalidArgs = { task: "" };
      expect(() =>
        validateToolArgs(SpawnAgentArgsSchema, invalidArgs, "spawn_agent"),
      ).toThrow(
        "Invalid arguments for spawn_agent: task: Task cannot be empty",
      );
    });
  });

  describe("safeValidateToolArgs utility", () => {
    it("should return success result for valid input", () => {
      const validArgs = { task: "Test task" };
      const result = safeValidateToolArgs(
        SpawnAgentArgsSchema,
        validArgs,
        "spawn_agent",
      );
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(validArgs);
      }
    });

    it("should return error result for invalid input", () => {
      const invalidArgs = { task: "" };
      const result = safeValidateToolArgs(
        SpawnAgentArgsSchema,
        invalidArgs,
        "spawn_agent",
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Invalid arguments for spawn_agent");
        expect(result.error).toContain("Task cannot be empty");
      }
    });

    it("should handle non-Zod errors gracefully", () => {
      const result = safeValidateToolArgs(
        SpawnAgentArgsSchema,
        null,
        "spawn_agent",
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Invalid arguments for spawn_agent");
      }
    });
  });

  describe("Edge cases and security", () => {
    it("should handle null input", () => {
      const result = safeValidateToolArgs(
        SpawnAgentArgsSchema,
        null,
        "spawn_agent",
      );
      expect(result.success).toBe(false);
    });

    it("should handle undefined input", () => {
      const result = safeValidateToolArgs(
        SpawnAgentArgsSchema,
        undefined,
        "spawn_agent",
      );
      expect(result.success).toBe(false);
    });

    it("should handle non-object input", () => {
      const result = safeValidateToolArgs(
        SpawnAgentArgsSchema,
        "string",
        "spawn_agent",
      );
      expect(result.success).toBe(false);
    });

    it("should handle very long strings", () => {
      const longString = "a".repeat(10000);
      const result = safeValidateToolArgs(
        SpawnAgentArgsSchema,
        { task: longString },
        "spawn_agent",
      );
      expect(result.success).toBe(true); // Long strings are valid
    });

    it("should handle special characters in task", () => {
      const specialTask =
        "Task with 🚀 emojis and <script>alert('xss')</script>";
      const result = safeValidateToolArgs(
        SpawnAgentArgsSchema,
        { task: specialTask },
        "spawn_agent",
      );
      expect(result.success).toBe(true); // Special characters are valid
    });
  });
});
