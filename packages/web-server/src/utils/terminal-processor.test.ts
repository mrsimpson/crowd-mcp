import { describe, it, expect } from "vitest";
import {
  stripAnsiCodes,
  processControlCharacters,
  removeControlCharacters,
  processTerminalOutput,
} from "./terminal-processor.js";

describe("terminal-processor", () => {
  describe("stripAnsiCodes", () => {
    it("should strip ANSI color codes", () => {
      const input = "\x1b[31mRed text\x1b[0m";
      const output = stripAnsiCodes(input);
      expect(output).toBe("Red text");
    });

    it("should strip cursor movement codes", () => {
      const input = "\x1b[2J\x1b[H Clear screen";
      const output = stripAnsiCodes(input);
      expect(output).toBe(" Clear screen");
    });

    it("should strip multiple ANSI codes", () => {
      const input = "\x1b[1m\x1b[31mBold Red\x1b[0m Normal";
      const output = stripAnsiCodes(input);
      expect(output).toBe("Bold Red Normal");
    });

    it("should handle text without ANSI codes", () => {
      const input = "Plain text";
      const output = stripAnsiCodes(input);
      expect(output).toBe("Plain text");
    });
  });

  describe("removeControlCharacters", () => {
    it("should remove control characters except newlines and carriage returns", () => {
      const input = "Hello\x07World\x08Test";
      const output = removeControlCharacters(input);
      expect(output).toBe("HelloWorldTest");
    });

    it("should preserve newlines", () => {
      const input = "Line1\nLine2";
      const output = removeControlCharacters(input);
      expect(output).toBe("Line1\nLine2");
    });

    it("should preserve carriage returns", () => {
      const input = "Text\rOverwrite";
      const output = removeControlCharacters(input);
      expect(output).toBe("Text\rOverwrite");
    });
  });

  describe("processControlCharacters", () => {
    it("should handle simple text with newlines", () => {
      const input = "Line1\nLine2\nLine3";
      const operations = processControlCharacters(input);

      expect(operations).toEqual([
        { type: "append", text: "Line1" },
        { type: "append", text: "Line2" },
        { type: "append", text: "Line3" },
      ]);
    });

    it("should handle carriage return (line update)", () => {
      const input = "Loading...\rDone!";
      const operations = processControlCharacters(input);

      expect(operations).toEqual([{ type: "update", text: "Done!" }]);
    });

    it("should handle multiple carriage returns (take last)", () => {
      const input = "Step1\rStep2\rStep3";
      const operations = processControlCharacters(input);

      expect(operations).toEqual([{ type: "update", text: "Step3" }]);
    });

    it("should handle ANSI codes and strip them", () => {
      const input = "\x1b[31mRed\x1b[0m\nNormal";
      const operations = processControlCharacters(input);

      expect(operations).toEqual([
        { type: "append", text: "Red" },
        { type: "append", text: "Normal" },
      ]);
    });

    it("should handle mixed newlines and carriage returns", () => {
      const input = "Line1\nProgress: 0%\rProgress: 50%\rProgress: 100%\nDone";
      const operations = processControlCharacters(input);

      expect(operations).toEqual([
        { type: "append", text: "Line1" },
        { type: "update", text: "Progress: 100%" },
        { type: "append", text: "Done" },
      ]);
    });

    it("should handle empty lines", () => {
      const input = "Line1\n\nLine3";
      const operations = processControlCharacters(input);

      expect(operations).toEqual([
        { type: "append", text: "Line1" },
        { type: "append", text: "" },
        { type: "append", text: "Line3" },
      ]);
    });
  });

  describe("processTerminalOutput", () => {
    it("should process complete terminal output with control chars and ANSI", () => {
      const input = "\x07\x1b[31mError:\x1b[0m Loading\rDone!\nNext line";
      const operations = processTerminalOutput(input);

      expect(operations).toEqual([
        { type: "update", text: "Done!" },
        { type: "append", text: "Next line" },
      ]);
    });

    it("should handle progress indicator patterns", () => {
      const input =
        "Downloading...\rDownloading... 25%\rDownloading... 100%\nComplete!";
      const operations = processTerminalOutput(input);

      expect(operations).toEqual([
        { type: "update", text: "Downloading... 100%" },
        { type: "append", text: "Complete!" },
      ]);
    });

    it("should handle terminal clear and rewrite patterns", () => {
      const input = "\x1b[2JOld content\rNew content";
      const operations = processTerminalOutput(input);

      expect(operations).toEqual([{ type: "update", text: "New content" }]);
    });
  });
});
