import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { EnvLoader } from "./env-loader.js";
import { mkdir, writeFile, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

describe("EnvLoader", () => {
  let loader: EnvLoader;
  let testDir: string;

  beforeEach(async () => {
    loader = new EnvLoader();
    testDir = join(tmpdir(), `crowd-mcp-env-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe("loadEnvVars", () => {
    it("should return empty array when no env files exist", () => {
      const vars = loader.loadEnvVars(testDir);

      expect(vars).toEqual([]);
    });

    it("should load variables from .env file", async () => {
      const configDir = join(testDir, ".crowd/opencode");
      await mkdir(configDir, { recursive: true });
      await writeFile(
        join(configDir, ".env"),
        "ANTHROPIC_API_KEY=sk-test-123\nOPENAI_API_KEY=sk-openai-456",
      );

      const vars = loader.loadEnvVars(testDir);

      expect(vars).toContain("ANTHROPIC_API_KEY=sk-test-123");
      expect(vars).toContain("OPENAI_API_KEY=sk-openai-456");
      expect(vars).toHaveLength(2);
    });

    it("should load variables from .env.local file", async () => {
      const configDir = join(testDir, ".crowd/opencode");
      await mkdir(configDir, { recursive: true });
      await writeFile(join(configDir, ".env.local"), "LOCAL_VAR=local-value");

      const vars = loader.loadEnvVars(testDir);

      expect(vars).toContain("LOCAL_VAR=local-value");
      expect(vars).toHaveLength(1);
    });

    it("should give .env.local priority over .env", async () => {
      const configDir = join(testDir, ".crowd/opencode");
      await mkdir(configDir, { recursive: true });
      await writeFile(
        join(configDir, ".env"),
        "API_KEY=from-env\nOTHER_VAR=other",
      );
      await writeFile(join(configDir, ".env.local"), "API_KEY=from-env-local");

      const vars = loader.loadEnvVars(testDir);

      expect(vars).toContain("API_KEY=from-env-local");
      expect(vars).toContain("OTHER_VAR=other");
      expect(vars).toHaveLength(2);
      expect(vars).not.toContain("API_KEY=from-env");
    });
  });

  describe("hasEnvFiles", () => {
    it("should return false when no env files exist", () => {
      const result = loader.hasEnvFiles(testDir);

      expect(result).toBe(false);
    });

    it("should return true when .env exists", async () => {
      const configDir = join(testDir, ".crowd/opencode");
      await mkdir(configDir, { recursive: true });
      await writeFile(join(configDir, ".env"), "KEY=value");

      const result = loader.hasEnvFiles(testDir);

      expect(result).toBe(true);
    });

    it("should return true when .env.local exists", async () => {
      const configDir = join(testDir, ".crowd/opencode");
      await mkdir(configDir, { recursive: true });
      await writeFile(join(configDir, ".env.local"), "KEY=value");

      const result = loader.hasEnvFiles(testDir);

      expect(result).toBe(true);
    });
  });
});
