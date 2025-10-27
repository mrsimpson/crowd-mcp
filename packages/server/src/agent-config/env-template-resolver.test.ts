import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { EnvTemplateResolver } from "./env-template-resolver.js";

describe("EnvTemplateResolver", () => {
  let resolver: EnvTemplateResolver;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    resolver = new EnvTemplateResolver();
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("resolve", () => {
    it("should replace ${VAR} with environment variable value when variable exists", () => {
      process.env.GITHUB_TOKEN = "ghp_test123";

      const result = resolver.resolve("Bearer ${GITHUB_TOKEN}");

      expect(result).toBe("Bearer ghp_test123");
    });

    it("should replace ${VAR} with empty string when variable does not exist", () => {
      delete process.env.NONEXISTENT_VAR;

      const result = resolver.resolve("Value: ${NONEXISTENT_VAR}");

      expect(result).toBe("Value: ");
    });

    it("should return unchanged string when no template present", () => {
      const result = resolver.resolve("No template here");

      expect(result).toBe("No template here");
    });

    it("should replace multiple templates in single string", () => {
      process.env.VAR1 = "value1";
      process.env.VAR2 = "value2";

      const result = resolver.resolve("${VAR1} and ${VAR2}");

      expect(result).toBe("value1 and value2");
    });

    it("should handle templates at start, middle, and end of string", () => {
      process.env.START = "beginning";
      process.env.MIDDLE = "center";
      process.env.END = "finish";

      const result = resolver.resolve("${START} is the ${MIDDLE} until ${END}");

      expect(result).toBe("beginning is the center until finish");
    });

    it("should handle empty string input", () => {
      const result = resolver.resolve("");

      expect(result).toBe("");
    });
  });

  describe("resolveObject", () => {
    it("should resolve templates in object string values", () => {
      process.env.API_KEY = "secret123";

      const input = {
        authorization: "Bearer ${API_KEY}",
        other: "static value",
      };

      const result = resolver.resolveObject(input);

      expect(result).toEqual({
        authorization: "Bearer secret123",
        other: "static value",
      });
    });

    it("should recursively resolve nested objects", () => {
      process.env.TOKEN = "token123";

      const input = {
        level1: {
          level2: {
            auth: "${TOKEN}",
          },
        },
      };

      const result = resolver.resolveObject(input);

      expect(result).toEqual({
        level1: {
          level2: {
            auth: "token123",
          },
        },
      });
    });

    it("should preserve non-string values unchanged", () => {
      const input = {
        string: "text",
        number: 42,
        boolean: true,
        nullValue: null,
        array: [1, 2, 3],
      };

      const result = resolver.resolveObject(input);

      expect(result).toEqual(input);
    });

    it("should resolve templates in array elements", () => {
      process.env.ARG1 = "value1";
      process.env.ARG2 = "value2";

      const input = {
        args: ["${ARG1}", "${ARG2}", "static"],
      };

      const result = resolver.resolveObject(input);

      expect(result).toEqual({
        args: ["value1", "value2", "static"],
      });
    });

    it("should handle empty object", () => {
      const result = resolver.resolveObject({});

      expect(result).toEqual({});
    });

    it("should not mutate original object", () => {
      process.env.VAR = "new";
      const original = { value: "${VAR}" };
      const originalCopy = JSON.parse(JSON.stringify(original));

      resolver.resolveObject(original);

      expect(original).toEqual(originalCopy);
    });
  });

  describe("resolveArray", () => {
    it("should resolve templates in array string elements", () => {
      process.env.CMD = "npx";
      process.env.PKG = "@modelcontextprotocol/server-git";

      const input = ["${CMD}", "-y", "${PKG}"];

      const result = resolver.resolveArray(input);

      expect(result).toEqual(["npx", "-y", "@modelcontextprotocol/server-git"]);
    });

    it("should handle nested arrays", () => {
      process.env.VAL = "test";

      const input = [["${VAL}"], ["static"]];

      const result = resolver.resolveArray(input);

      expect(result).toEqual([["test"], ["static"]]);
    });

    it("should handle mixed types in array", () => {
      process.env.STR = "string";

      const input = ["${STR}", 123, true, null, { key: "${STR}" }];

      const result = resolver.resolveArray(input);

      expect(result).toEqual(["string", 123, true, null, { key: "string" }]);
    });
  });
});
