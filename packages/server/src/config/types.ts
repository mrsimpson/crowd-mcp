/**
 * OpenCode configuration types
 */

export interface OpenCodeProvider {
  npm: string;
  name?: string;
  options?: {
    baseURL?: string;
    apiKey?: string;
    [key: string]: unknown;
  };
  models?: Record<string, OpenCodeModel>;
}

export interface OpenCodeModel {
  name?: string;
  id?: string;
  reasoning?: boolean;
  tool_call?: boolean;
  [key: string]: unknown;
}

export interface OpenCodeAgent {
  model?: string;
  description?: string;
  temperature?: number;
  reasoningEffort?: string;
  mode?: "primary" | "subagent" | "all";
  tools?: string[];
  [key: string]: unknown;
}

export interface OpenCodeConfig {
  $schema?: string;
  provider?: Record<string, OpenCodeProvider>;
  agents?: Record<string, OpenCodeAgent>;
  model?: string;
  small_model?: string;
  [key: string]: unknown;
}

export interface ConfigValidationError {
  type: "no_providers" | "invalid_agent_provider" | "config_missing";
  message: string;
  details?: Record<string, unknown>;
}
