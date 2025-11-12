import type { McpServerConfig } from "./types.js";

/**
 * ACP MCP Server format (expected by OpenCode ACP)
 */
export interface AcpMcpServer {
  name: string;
  command?: string;
  args?: string[];
  env?: Array<{ name: string; value: string }>;
  type?: "http" | "sse";
  url?: string;
  headers?: Array<{ name: string; value: string }>;
}

/**
 * Convert MCP server configurations to ACP format
 */
export class AcpMcpConverter {
  /**
   * Convert MCP servers from YAML format to ACP format
   */
  static convertToAcpFormat(
    mcpServers: Record<string, McpServerConfig>,
  ): AcpMcpServer[] {
    return Object.entries(mcpServers).map(([name, config]) =>
      this.convertSingleServer(name, config),
    );
  }

  /**
   * Convert a single MCP server to ACP format
   */
  private static convertSingleServer(
    name: string,
    config: McpServerConfig,
  ): AcpMcpServer {
    if (config.type === "stdio") {
      return {
        name,
        command: config.command,
        args: config.args || [],
        env: this.convertEnvToAcp(config.env || {}),
      };
    } else if (config.type === "http") {
      return {
        name,
        type: "http",
        url: config.url,
        headers: this.convertHeadersToAcp(config.headers || {}),
      };
    } else {
      // This should never happen with proper typing, but handle it gracefully
      throw new Error(`Unsupported MCP server type: ${(config as any).type}`);
    }
  }

  /**
   * Create messaging MCP server for ACP
   */
  static createMessagingServer(agentMcpUrl: string): AcpMcpServer {
    return {
      name: "messaging",
      type: "http",
      url: agentMcpUrl,
      headers: [],
    };
  }

  /**
   * Convert environment object to ACP format
   */
  private static convertEnvToAcp(
    env: Record<string, string>,
  ): Array<{ name: string; value: string }> {
    return Object.entries(env).map(([name, value]) => ({ name, value }));
  }

  /**
   * Convert headers object to ACP format
   */
  private static convertHeadersToAcp(
    headers: Record<string, string>,
  ): Array<{ name: string; value: string }> {
    return Object.entries(headers).map(([name, value]) => ({ name, value }));
  }
}
