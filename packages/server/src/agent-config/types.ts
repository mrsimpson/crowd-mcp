/**
 * Agent Configuration Types
 *
 * CLI-agnostic agent definition types that can be converted to
 * specific CLI configurations (OpenCode, Aider, etc.)
 */

/**
 * MCP Server Configuration - Stdio based
 */
export interface StdioMcpServer {
  type: "stdio";
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

/**
 * MCP Server Configuration - HTTP based
 */
export interface HttpMcpServer {
  type: "http";
  url: string;
  headers?: Record<string, string>;
}

/**
 * Union type for all MCP server configurations
 */
export type McpServerConfig = StdioMcpServer | HttpMcpServer;

/**
 * LLM Settings
 */
export interface LlmSettings {
  temperature?: number;
  reasoningEffort?: "low" | "medium" | "high";
}

/**
 * Optional container-specific settings
 */
export interface ContainerSettings {
  memory?: string;
  cpus?: number;
  user?: string;
}

/**
 * Complete Agent Definition
 *
 * Loaded from .crowd/agents/{name}.yaml
 */
export interface AgentDefinition {
  name: string;
  displayName?: string;
  systemPrompt: string;
  preferredModels?: string[];
  llmSettings?: LlmSettings;
  mcpServers?: Record<string, McpServerConfig>;
  capabilities?: string[];
  container?: ContainerSettings;
}

/**
 * Agent Definition Validation Error
 */
export interface AgentDefinitionValidationError {
  field: string;
  message: string;
}
