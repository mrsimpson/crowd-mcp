import { describe, it, expect } from "vitest";
import { AcpMcpConverter } from "./acp-mcp-converter.js";
import type { McpServerConfig } from "./types.js";

describe("AcpMcpConverter", () => {
  describe("convertToAcpFormat", () => {
    it("should convert stdio MCP server to ACP format", () => {
      const mcpServers: Record<string, McpServerConfig> = {
        filesystem: {
          type: "stdio",
          command: "npx",
          args: ["@modelcontextprotocol/server-filesystem"],
          env: {
            PATH: "/usr/bin",
            NODE_ENV: "production",
          },
        },
      };

      const result = AcpMcpConverter.convertToAcpFormat(mcpServers);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        name: "filesystem",
        command: "npx",
        args: ["@modelcontextprotocol/server-filesystem"],
        env: [
          { name: "PATH", value: "/usr/bin" },
          { name: "NODE_ENV", value: "production" },
        ],
      });
    });

    it("should convert HTTP MCP server to ACP format", () => {
      const mcpServers: Record<string, McpServerConfig> = {
        github: {
          type: "http",
          url: "https://api.github.com/mcp",
          headers: {
            Authorization: "Bearer token123",
            "User-Agent": "crowd-mcp",
          },
        },
      };

      const result = AcpMcpConverter.convertToAcpFormat(mcpServers);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        name: "github",
        type: "http",
        url: "https://api.github.com/mcp",
        headers: [
          { name: "Authorization", value: "Bearer token123" },
          { name: "User-Agent", value: "crowd-mcp" },
        ],
      });
    });

    it("should handle multiple MCP servers", () => {
      const mcpServers: Record<string, McpServerConfig> = {
        filesystem: {
          type: "stdio",
          command: "npx",
          args: ["@modelcontextprotocol/server-filesystem"],
        },
        github: {
          type: "http",
          url: "https://api.github.com/mcp",
        },
      };

      const result = AcpMcpConverter.convertToAcpFormat(mcpServers);

      expect(result).toHaveLength(2);
      expect(result.find((s) => s.name === "filesystem")).toBeDefined();
      expect(result.find((s) => s.name === "github")).toBeDefined();
    });

    it("should handle empty MCP servers", () => {
      const result = AcpMcpConverter.convertToAcpFormat({});
      expect(result).toHaveLength(0);
    });

    it("should handle stdio server without args or env", () => {
      const mcpServers: Record<string, McpServerConfig> = {
        simple: {
          type: "stdio",
          command: "python",
        },
      };

      const result = AcpMcpConverter.convertToAcpFormat(mcpServers);

      expect(result[0]).toEqual({
        name: "simple",
        command: "python",
        args: [],
        env: [],
      });
    });

    it("should handle HTTP server without headers", () => {
      const mcpServers: Record<string, McpServerConfig> = {
        api: {
          type: "http",
          url: "https://example.com/mcp",
        },
      };

      const result = AcpMcpConverter.convertToAcpFormat(mcpServers);

      expect(result[0]).toEqual({
        name: "api",
        type: "http",
        url: "https://example.com/mcp",
        headers: [],
      });
    });
  });

  describe("createMessagingServer", () => {
    it("should create messaging MCP server in ACP format", () => {
      const agentMcpUrl = "http://host.docker.internal:3100/mcp";
      const result = AcpMcpConverter.createMessagingServer(agentMcpUrl);

      expect(result).toEqual({
        name: "messaging",
        type: "http",
        url: agentMcpUrl,
        headers: [],
      });
    });

    it("should handle different URLs", () => {
      const customUrl = "http://localhost:9999/mcp";
      const result = AcpMcpConverter.createMessagingServer(customUrl);

      expect(result.url).toBe(customUrl);
      expect(result.name).toBe("messaging");
    });
  });
});
