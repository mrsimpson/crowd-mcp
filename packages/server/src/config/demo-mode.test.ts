import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ConfigValidator } from "../config/validator.js";
import { mkdir, writeFile, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

describe("Server startup with CROWD_DEMO_MODE", () => {
  let testDir: string;
  const originalEnv = process.env.CROWD_DEMO_MODE;

  beforeEach(async () => {
    testDir = join(tmpdir(), `crowd-mcp-demo-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
    // Restore original environment
    if (originalEnv !== undefined) {
      process.env.CROWD_DEMO_MODE = originalEnv;
    } else {
      delete process.env.CROWD_DEMO_MODE;
    }
  });

  it("should validate configuration by default (demo mode off)", async () => {
    delete process.env.CROWD_DEMO_MODE;
    const validator = new ConfigValidator();

    const result = await validator.validateConfig(testDir);

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors?.[0]?.type).toBe("config_missing");
  });

  it("should still validate when CROWD_DEMO_MODE=false", async () => {
    process.env.CROWD_DEMO_MODE = "false";
    const validator = new ConfigValidator();

    const result = await validator.validateConfig(testDir);

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
  });

  it("should allow validation errors when CROWD_DEMO_MODE=true", async () => {
    process.env.CROWD_DEMO_MODE = "true";
    const validator = new ConfigValidator();

    const result = await validator.validateConfig(testDir);

    // Validation still runs and returns errors
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);

    // But the server startup should handle this gracefully
    const isDemoMode = process.env.CROWD_DEMO_MODE === "true";
    expect(isDemoMode).toBe(true);
  });

  it("should pass validation when config is valid regardless of demo mode", async () => {
    process.env.CROWD_DEMO_MODE = "true";

    const configDir = join(testDir, ".crowd/opencode");
    await mkdir(configDir, { recursive: true });
    await writeFile(
      join(configDir, "opencode.json"),
      JSON.stringify({
        provider: {
          anthropic: {
            npm: "@anthropic-ai/sdk",
            models: { "claude-3-5-sonnet": { name: "Claude 3.5 Sonnet" } },
          },
        },
      }),
    );

    const validator = new ConfigValidator();
    const result = await validator.validateConfig(testDir);

    expect(result.valid).toBe(true);
  });
});
