/**
 * MCP Tool Parameter Schemas
 * Zod schemas for validating tool call arguments according to MCP protocol requirements
 */

import { z } from "zod";

// Schema for spawn_agent tool
export const SpawnAgentArgsSchema = z.object({
  task: z.string().min(1, "Task cannot be empty"),
  agentType: z.string().optional(),
});

export type SpawnAgentArgs = z.infer<typeof SpawnAgentArgsSchema>;

// Schema for stop_agent tool
export const StopAgentArgsSchema = z.object({
  agentId: z.string().min(1, "Agent ID cannot be empty"),
});

export type StopAgentArgs = z.infer<typeof StopAgentArgsSchema>;

// Schema for send_message tool
export const SendMessageArgsSchema = z.object({
  to: z.string().min(1, "Recipient cannot be empty"),
  content: z.string().min(1, "Content cannot be empty"),
  priority: z.enum(["low", "normal", "high"]).optional(),
});

export type SendMessageArgs = z.infer<typeof SendMessageArgsSchema>;

// Schema for get_messages tool
export const GetMessagesArgsSchema = z.object({
  unreadOnly: z.boolean().optional(),
  limit: z.number().int().positive().optional(),
  markAsRead: z.boolean().optional(),
});

export type GetMessagesArgs = z.infer<typeof GetMessagesArgsSchema>;

// Schema for mark_messages_read tool
export const MarkMessagesReadArgsSchema = z.object({
  messageIds: z.array(z.string().min(1, "Message ID cannot be empty")),
});

export type MarkMessagesReadArgs = z.infer<typeof MarkMessagesReadArgsSchema>;

// Schema for list_agents tool (no parameters)
export const ListAgentsArgsSchema = z.object({});

export type ListAgentsArgs = z.infer<typeof ListAgentsArgsSchema>;

/**
 * Validates tool arguments using the appropriate schema
 * Returns validated data or throws error with validation details
 */
export function validateToolArgs<T>(
  schema: z.ZodSchema<T>,
  args: unknown,
  toolName: string,
): T {
  try {
    return schema.parse(args);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessage = error.issues
        .map((err) => `${err.path.join(".")}: ${err.message}`)
        .join(", ");
      throw new Error(`Invalid arguments for ${toolName}: ${errorMessage}`);
    }
    throw error;
  }
}

/**
 * Safe validation that returns either success or error result
 * Useful when you want to handle validation errors gracefully
 */
export function safeValidateToolArgs<T>(
  schema: z.ZodSchema<T>,
  args: unknown,
  toolName: string,
): { success: true; data: T } | { success: false; error: string } {
  try {
    const data = schema.parse(args);
    return { success: true, data };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessage = error.issues
        .map((err) => `${err.path.join(".")}: ${err.message}`)
        .join(", ");
      return {
        success: false,
        error: `Invalid arguments for ${toolName}: ${errorMessage}`,
      };
    }
    return {
      success: false,
      error: `Validation error for ${toolName}: ${error}`,
    };
  }
}
