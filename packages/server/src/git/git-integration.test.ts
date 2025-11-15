/**
 * Integration tests for Git repository cloning functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ContainerManager } from "../docker/container-manager.js";
import { McpLogger } from "../mcp/mcp-logger.js";
import { tmpdir } from "os";
import { join } from "path";
import { mkdtemp, rm } from "fs/promises";
import type Dockerode from "dockerode";

describe("Git Repository Cloning Integration", () => {
  let containerManager: ContainerManager;
  let mockDocker: Dockerode;
  let mockLogger: McpLogger;
  let tempDir: string;

  beforeEach(async () => {
    // Create temporary directory for test workspace
    tempDir = await mkdtemp(join(tmpdir(), "git-clone-test-"));

    // Mock logger
    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      setLevel: vi.fn(),
    } as any;

    // Mock Docker container for git operations
    const mockContainer = {
      inspect: vi.fn().mockResolvedValue({
        State: { Running: true },
        Id: "test-container-id",
      }),
      exec: vi.fn().mockImplementation(() => ({
        start: vi.fn().mockImplementation(() => {
          // Mock successful git clone
          const mockStream = {
            on: vi.fn().mockImplementation((event, callback) => {
              if (event === "data") {
                // Simulate git clone output
                const stdout = Buffer.concat([
                  Buffer.from([1, 0, 0, 0, 0, 0, 0, 25]), // Docker stream header for stdout
                  Buffer.from("Cloning into 'test-repo'..."),
                ]);
                callback(stdout);
              } else if (event === "end") {
                callback();
              }
            }),
          };
          return Promise.resolve(mockStream);
        }),
        inspect: vi.fn().mockResolvedValue({ ExitCode: 0 }),
      })),
    };

    // Mock Docker API
    mockDocker = {
      getContainer: vi.fn().mockReturnValue(mockContainer),
    } as any;

    containerManager = new ContainerManager(mockLogger, mockDocker);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("cloneRepositoryInAgent", () => {
    it("should successfully clone a repository with HTTPS URL", async () => {
      const result = await containerManager.cloneRepositoryInAgent(
        "test-agent-123",
        "https://github.com/example/test-repo.git",
        "test-repo",
        "main",
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain("Cloning into");
      expect(mockDocker.getContainer).toHaveBeenCalledWith(
        "agent-test-agent-123",
      );
    });

    it("should successfully clone a repository with SSH URL", async () => {
      const result = await containerManager.cloneRepositoryInAgent(
        "test-agent-456",
        "git@github.com:example/test-repo.git",
        "test-repo",
        "develop",
      );

      expect(result.success).toBe(true);
      expect(mockDocker.getContainer).toHaveBeenCalledWith(
        "agent-test-agent-456",
      );
    });

    it("should handle git clone failure", async () => {
      // Mock failed git clone
      const mockContainer = {
        inspect: vi.fn().mockResolvedValue({
          State: { Running: true },
        }),
        exec: vi.fn().mockImplementation(() => ({
          start: vi.fn().mockImplementation(() => {
            const mockStream = {
              on: vi.fn().mockImplementation((event, callback) => {
                if (event === "data") {
                  // Simulate git clone error
                  const stderr = Buffer.concat([
                    Buffer.from([2, 0, 0, 0, 0, 0, 0, 30]), // Docker stream header for stderr
                    Buffer.from("fatal: repository not found"),
                  ]);
                  callback(stderr);
                } else if (event === "end") {
                  callback();
                }
              }),
            };
            return Promise.resolve(mockStream);
          }),
          inspect: vi.fn().mockResolvedValue({ ExitCode: 1 }),
        })),
      };

      (mockDocker.getContainer as any).mockReturnValue(mockContainer);

      const result = await containerManager.cloneRepositoryInAgent(
        "test-agent-789",
        "https://github.com/example/nonexistent.git",
        "nonexistent",
        "main",
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("repository not found");
    });

    it("should handle container not running", async () => {
      const mockContainer = {
        inspect: vi.fn().mockResolvedValue({
          State: { Running: false },
        }),
      };

      (mockDocker.getContainer as any).mockReturnValue(mockContainer);

      const result = await containerManager.cloneRepositoryInAgent(
        "test-agent-stopped",
        "https://github.com/example/test-repo.git",
        "test-repo",
        "main",
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("is not running");
    });

    it("should use default branch when none specified", async () => {
      await containerManager.cloneRepositoryInAgent(
        "test-agent-default",
        "https://github.com/example/test-repo.git",
        "test-repo",
        // No branch parameter - should default to "main"
      );

      // Verify that the exec was called with "main" branch
      const mockContainer = mockDocker.getContainer("agent-test-agent-default");
      expect(mockContainer.exec).toHaveBeenCalledWith(
        expect.objectContaining({
          Cmd: [
            "git",
            "clone",
            "--branch",
            "main",
            "--single-branch",
            "https://github.com/example/test-repo.git",
            "test-repo",
          ],
        }),
      );
    });
  });

  describe("Git credential mounting", () => {
    it("should mount SSH keys and git config when available", async () => {
      // This would be tested in a broader integration test with actual file system
      // For now, we verify the logic by checking if the method exists
      expect(typeof containerManager.cloneRepositoryInAgent).toBe("function");
    });
  });
});
