/**
 * Environment Template Resolver
 *
 * Resolves ${VAR} templates in strings, objects, and arrays by replacing them
 * with values from process.env. Missing variables are replaced with empty strings.
 */
export class EnvTemplateResolver {
  /**
   * Resolve environment variable templates in a string
   *
   * @param value - String potentially containing ${VAR} templates
   * @returns String with templates replaced by environment variable values
   *
   * @example
   * process.env.TOKEN = "abc123";
   * resolver.resolve("Bearer ${TOKEN}"); // "Bearer abc123"
   * resolver.resolve("Value: ${MISSING}"); // "Value: "
   */
  resolve(value: string): string {
    return value.replace(/\$\{([^}]+)\}/g, (_, varName) => {
      return process.env[varName] ?? "";
    });
  }

  /**
   * Recursively resolve environment variable templates in an object
   *
   * @param obj - Object potentially containing ${VAR} templates in string values
   * @returns New object with all templates resolved
   *
   * @example
   * process.env.API_KEY = "secret";
   * resolver.resolveObject({ auth: "Bearer ${API_KEY}" });
   * // { auth: "Bearer secret" }
   */
  resolveObject<T>(obj: T): T {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj === "string") {
      return this.resolve(obj) as T;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.resolveObject(item)) as T;
    }

    if (typeof obj === "object") {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.resolveObject(value);
      }
      return result as T;
    }

    // Primitives (number, boolean, etc.) remain unchanged
    return obj;
  }

  /**
   * Resolve environment variable templates in an array
   *
   * @param arr - Array potentially containing ${VAR} templates
   * @returns New array with all templates resolved
   *
   * @example
   * process.env.CMD = "npx";
   * resolver.resolveArray(["${CMD}", "-y", "package"]);
   * // ["npx", "-y", "package"]
   */
  resolveArray<T>(arr: T[]): T[] {
    return arr.map((item) => this.resolveObject(item));
  }
}
