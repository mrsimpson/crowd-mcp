/**
 * LiveTerminal Component
 * Displays streaming logs from an agent container
 */
export class LiveTerminal {
  constructor(apiClient) {
    this.apiClient = apiClient;
    this.agentId = null;
    this.logStream = null;
    this.element = null;
    this.logsContainer = null;
    this.statusIndicator = null;
    this.lastLogLine = null; // Track the last line for updates
  }

  /**
   * Create the terminal element
   * @returns {HTMLElement}
   */
  createElement() {
    const terminal = document.createElement("div");
    terminal.className = "live-terminal";

    terminal.innerHTML = `
      <div class="terminal-header">
        <div class="terminal-status">
          <div class="terminal-status-indicator"></div>
          <span class="terminal-status-text">Connecting...</span>
        </div>
      </div>
      <div class="terminal-body">
        <div class="terminal-logs"></div>
      </div>
    `;

    this.element = terminal;
    this.logsContainer = terminal.querySelector(".terminal-logs");
    this.statusIndicator = terminal.querySelector(".terminal-status-indicator");
    this.statusText = terminal.querySelector(".terminal-status-text");

    return terminal;
  }

  /**
   * Start streaming logs for an agent
   * @param {string} agentId
   */
  startStreaming(agentId) {
    this.agentId = agentId;

    // Stop existing stream if any
    this.stopStreaming();

    // Create new log stream
    this.logStream = this.apiClient.createLogStream(agentId, 100);

    this.logStream.onopen = () => {
      this.updateStatus("streaming", "Live streaming");
    };

    this.logStream.addEventListener("message", (event) => {
      const data = JSON.parse(event.data);

      // Handle legacy log format for backward compatibility
      if (data.log) {
        this.appendLog(data.log);
      }

      // Handle new operation-based format (append or update)
      if (data.type && data.text !== undefined) {
        if (data.type === "append") {
          this.appendLog(data.text);
        } else if (data.type === "update") {
          this.updateLastLine(data.text);
        }
      }

      if (data.end) {
        this.updateStatus("ended", "Stream ended");
        this.stopStreaming();
      }

      if (data.error) {
        this.appendError(data.error);
        this.updateStatus("error", "Error occurred");
      }
    });

    this.logStream.onerror = (error) => {
      console.error("Log stream error:", error);
      this.updateStatus("error", "Connection error");
    };
  }

  /**
   * Stop streaming logs
   */
  stopStreaming() {
    if (this.logStream) {
      this.logStream.close();
      this.logStream = null;
    }
  }

  /**
   * Append a log line to the terminal
   * @param {string} text
   */
  appendLog(text) {
    if (!this.logsContainer) return;

    const logLine = document.createElement("div");
    logLine.className = "log-line";
    logLine.textContent = text;

    this.logsContainer.appendChild(logLine);
    this.lastLogLine = logLine; // Track this as the last line

    // Auto-scroll to bottom
    this.logsContainer.scrollTop = this.logsContainer.scrollHeight;
  }

  /**
   * Update the last log line (for carriage return handling)
   * @param {string} text
   */
  updateLastLine(text) {
    if (!this.logsContainer) return;

    // If there's a last line, update it
    if (
      this.lastLogLine &&
      this.lastLogLine.parentNode === this.logsContainer
    ) {
      this.lastLogLine.textContent = text;
    } else {
      // No last line exists, create a new one
      this.appendLog(text);
    }

    // Auto-scroll to bottom
    this.logsContainer.scrollTop = this.logsContainer.scrollHeight;
  }

  /**
   * Append an error message to the terminal
   * @param {string} message
   */
  appendError(message) {
    if (!this.logsContainer) return;

    const errorLine = document.createElement("div");
    errorLine.className = "log-line log-error";
    errorLine.textContent = `Error: ${message}`;

    this.logsContainer.appendChild(errorLine);
    this.logsContainer.scrollTop = this.logsContainer.scrollHeight;
  }

  /**
   * Update the status indicator
   * @param {string} status - 'connecting' | 'streaming' | 'ended' | 'error'
   * @param {string} text - Status text to display
   */
  updateStatus(status, text) {
    if (!this.statusIndicator || !this.statusText) return;

    // Remove all status classes
    this.statusIndicator.className = "terminal-status-indicator";

    // Add new status class
    this.statusIndicator.classList.add(`status-${status}`);
    this.statusText.textContent = text;
  }

  /**
   * Clear the terminal
   */
  clear() {
    if (this.logsContainer) {
      this.logsContainer.innerHTML = "";
    }
    this.lastLogLine = null; // Reset last line tracking
  }

  /**
   * Destroy the terminal and clean up
   */
  destroy() {
    this.stopStreaming();
    if (this.element) {
      this.element.remove();
      this.element = null;
    }
    this.logsContainer = null;
    this.statusIndicator = null;
    this.statusText = null;
    this.lastLogLine = null;
  }
}
