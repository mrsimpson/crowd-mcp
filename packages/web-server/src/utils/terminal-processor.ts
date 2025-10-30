/**
 * Terminal Output Processor
 * Handles ANSI escape sequences and control characters in terminal output
 */

/**
 * Strips ANSI escape sequences from text
 * Handles color codes, cursor movement, and other escape sequences
 */
export function stripAnsiCodes(text: string): string {
  // Remove ANSI escape sequences
  // Matches: ESC[...m (SGR - colors/formatting), ESC[...H (cursor position), etc.
  return text.replace(
    // eslint-disable-next-line no-control-regex
    /\x1b\[[0-9;]*[a-zA-Z]/g,
    "",
  );
}

/**
 * Processes terminal control characters and returns processed lines
 * Handles carriage returns (\r) by splitting text into line updates
 *
 * @param text Raw text from terminal output
 * @returns Array of {type: 'append'|'update', text: string} operations
 */
export function processControlCharacters(
  text: string,
): Array<{ type: "append" | "update"; text: string }> {
  const operations: Array<{ type: "append" | "update"; text: string }> = [];

  // First strip ANSI codes
  const cleanText = stripAnsiCodes(text);

  // Handle carriage returns
  // Split by \n to get lines
  const lines = cleanText.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check if line contains carriage return
    if (line.includes("\r")) {
      // Split by \r and take the last part (simulates overwriting in terminal)
      const parts = line.split("\r");
      const finalText = parts[parts.length - 1];

      if (finalText) {
        // Carriage return means update current line
        operations.push({ type: "update", text: finalText });
      }
    } else {
      // Regular line
      if (line || i < lines.length - 1) {
        // Add line if it has content or if it's not the last empty line
        operations.push({ type: "append", text: line });
      }
    }
  }

  return operations;
}

/**
 * Removes non-printable control characters (except newlines and carriage returns)
 */
export function removeControlCharacters(text: string): string {
  // Remove control characters except \n (newline) and \r (carriage return)
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, "");
}

/**
 * Full terminal output processing pipeline
 * Removes control chars, strips ANSI, handles carriage returns
 */
export function processTerminalOutput(
  text: string,
): Array<{ type: "append" | "update"; text: string }> {
  // First remove non-printable control characters
  const cleanedText = removeControlCharacters(text);

  // Then process carriage returns and ANSI codes
  return processControlCharacters(cleanedText);
}
