import { existsSync } from "fs";
import { join } from "path";
import { config as dotenvConfig } from "dotenv";

/**
 * Loads environment variables from .crowd/opencode/.env and .crowd/opencode/.env.local
 * Returns an array of "KEY=VALUE" strings suitable for Docker container ENV.
 */
export class EnvLoader {
  /**
   * Loads environment variables from the OpenCode config directory.
   * Priority: .env.local overrides .env
   */
  loadEnvVars(workspacePath: string): string[] {
    const configDir = join(workspacePath, ".crowd/opencode");
    const envPath = join(configDir, ".env");
    const envLocalPath = join(configDir, ".env.local");

    const envVars = new Map<string, string>();

    // Load .env first (lower priority)
    if (existsSync(envPath)) {
      const result = dotenvConfig({ path: envPath });
      if (result.parsed) {
        for (const [key, value] of Object.entries(result.parsed)) {
          envVars.set(key, value);
        }
      }
    }

    // Load .env.local second (higher priority, overrides .env)
    if (existsSync(envLocalPath)) {
      const result = dotenvConfig({ path: envLocalPath });
      if (result.parsed) {
        for (const [key, value] of Object.entries(result.parsed)) {
          envVars.set(key, value);
        }
      }
    }

    // Convert to Docker ENV format: ["KEY=VALUE", ...]
    return Array.from(envVars.entries()).map(
      ([key, value]) => `${key}=${value}`,
    );
  }

  /**
   * Checks if any env files exist in the config directory
   */
  hasEnvFiles(workspacePath: string): boolean {
    const configDir = join(workspacePath, ".crowd/opencode");
    const envPath = join(configDir, ".env");
    const envLocalPath = join(configDir, ".env.local");

    return existsSync(envPath) || existsSync(envLocalPath);
  }
}
