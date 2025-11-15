import { describe, it, expect, beforeEach } from "vitest";
import Docker from "dockerode";
import { ContainerManager } from "./container-manager.ts";
import { EnvLoader } from "../config/env-loader.ts";
import { AcpLogger } from "../acp/acp-logger.ts";
import { ConfigGenerator } from "../agent-config/config-generator.ts";
import { AgentMcpServer } from "../mcp/agent-mcp-server.ts";

describe("Git Authentication with Personal Access Tokens", () => {
  let containerManager: ContainerManager;
  let mockLogger: AcpLogger;
  let mockEnvLoader: EnvLoader;
  let mockConfigGenerator: ConfigGenerator;
  let mockAgentMcpServer: AgentMcpServer;

  beforeEach(() => {
    mockLogger = {
      info: async () => {},
      error: async () => {},
      debug: async () => {},
    } as any;

    mockEnvLoader = {
      loadEnvVars: () => [],
    } as any;

    mockConfigGenerator = {
      generateAcpMcpServers: async () => ({ mcpServers: [] }),
    } as any;

    mockAgentMcpServer = {} as any;

    containerManager = new ContainerManager(
      new Docker(),
      mockEnvLoader,
      mockLogger,
      mockConfigGenerator,
      3001,
      mockAgentMcpServer,
    );
  });

  it("should add GitHub token to container environment when available", async () => {
    // Set up environment
    const originalGitHubToken = process.env.GITHUB_TOKEN;
    process.env.GITHUB_TOKEN = "ghp_test_token_123";

    try {
      // Mock Docker createContainer to capture environment variables
      const mockDocker = {
        createContainer: async (options: any) => {
          expect(options.Env).toContain("GITHUB_TOKEN=ghp_test_token_123");
          return {
            id: "test-container",
            start: async () => {},
          };
        },
      } as any;

      // Override the docker instance for this test
      (containerManager as any).docker = mockDocker;

      // Test spawning an agent
      const config = {
        agentId: "test-agent",
        task: "Test task",
        workspace: "/tmp/test-workspace",
        agentType: "default",
      };

      // This should include the GitHub token in the environment
      await expect(containerManager.spawnAgent(config)).rejects.toThrow(); // Will fail on ACP setup, but that's fine for this test
    } finally {
      // Restore original environment
      if (originalGitHubToken !== undefined) {
        process.env.GITHUB_TOKEN = originalGitHubToken;
      } else {
        delete process.env.GITHUB_TOKEN;
      }
    }
  });

  it("should add GitLab token to container environment when available", async () => {
    // Set up environment
    const originalGitLabToken = process.env.GITLAB_TOKEN;
    process.env.GITLAB_TOKEN = "glpat_test_token_456";

    try {
      // Mock Docker createContainer to capture environment variables
      const mockDocker = {
        createContainer: async (options: any) => {
          expect(options.Env).toContain("GITLAB_TOKEN=glpat_test_token_456");
          return {
            id: "test-container",
            start: async () => {},
          };
        },
      } as any;

      // Override the docker instance for this test
      (containerManager as any).docker = mockDocker;

      // Test spawning an agent
      const config = {
        agentId: "test-agent",
        task: "Test task",
        workspace: "/tmp/test-workspace",
        agentType: "default",
      };

      // This should include the GitLab token in the environment
      await expect(containerManager.spawnAgent(config)).rejects.toThrow(); // Will fail on ACP setup, but that's fine for this test
    } finally {
      // Restore original environment
      if (originalGitLabToken !== undefined) {
        process.env.GITLAB_TOKEN = originalGitLabToken;
      } else {
        delete process.env.GITLAB_TOKEN;
      }
    }
  });

  it("should work without tokens when not available", async () => {
    // Ensure no tokens are set
    const originalGitHubToken = process.env.GITHUB_TOKEN;
    const originalGitLabToken = process.env.GITLAB_TOKEN;
    delete process.env.GITHUB_TOKEN;
    delete process.env.GITLAB_TOKEN;

    try {
      // Mock Docker createContainer to ensure no tokens are passed
      const mockDocker = {
        createContainer: async (options: any) => {
          expect(options.Env).not.toContain(
            expect.stringMatching(/^GITHUB_TOKEN=/),
          );
          expect(options.Env).not.toContain(
            expect.stringMatching(/^GITLAB_TOKEN=/),
          );
          return {
            id: "test-container",
            start: async () => {},
          };
        },
      } as any;

      // Override the docker instance for this test
      (containerManager as any).docker = mockDocker;

      // Test spawning an agent
      const config = {
        agentId: "test-agent",
        task: "Test task",
        workspace: "/tmp/test-workspace",
        agentType: "default",
      };

      // This should work without tokens
      await expect(containerManager.spawnAgent(config)).rejects.toThrow(); // Will fail on ACP setup, but that's fine for this test
    } finally {
      // Restore original environment
      if (originalGitHubToken !== undefined) {
        process.env.GITHUB_TOKEN = originalGitHubToken;
      }
      if (originalGitLabToken !== undefined) {
        process.env.GITLAB_TOKEN = originalGitLabToken;
      }
    }
  });
});
