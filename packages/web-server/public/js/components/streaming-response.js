/**
 * StreamingResponse Component
 * Displays real-time streaming responses from ACP agents
 */
export class StreamingResponse {
  constructor() {
    this.agentId = null;
    this.element = null;
    this.responseContainer = null;
    this.statusIndicator = null;
    this.statusText = null;
    this.currentContent = "";
    this.isStreaming = false;
  }

  /**
   * Create the streaming response element
   * @returns {HTMLElement}
   */
  createElement() {
    const container = document.createElement("div");
    container.className = "streaming-response";

    container.innerHTML = `
      <div class="streaming-header">
        <div class="streaming-status">
          <div class="streaming-status-indicator"></div>
          <span class="streaming-status-text">Idle</span>
        </div>
      </div>
      <div class="streaming-body">
        <div class="streaming-content"></div>
      </div>
    `;

    this.element = container;
    this.responseContainer = container.querySelector(".streaming-content");
    this.statusIndicator = container.querySelector(
      ".streaming-status-indicator",
    );
    this.statusText = container.querySelector(".streaming-status-text");

    return container;
  }

  /**
   * Set the agent ID for this streaming response
   * @param {string} agentId
   */
  setAgentId(agentId) {
    this.agentId = agentId;
  }

  /**
   * Handle streaming start event
   * @param {Object} data - { agentId, prompt }
   */
  onStreamingStart(data) {
    if (data.agentId !== this.agentId) return;

    this.isStreaming = true;
    this.currentContent = "";
    this.updateStatus("streaming", "Agent is thinking...");
    this.clearContent();
  }

  /**
   * Handle streaming chunk event
   * @param {Object} data - { agentId, chunk, accumulated }
   */
  onStreamingChunk(data) {
    if (data.agentId !== this.agentId) return;

    this.currentContent = data.accumulated;
    this.updateContent(this.currentContent);
    this.updateStatus("streaming", "Streaming response...");
  }

  /**
   * Handle streaming complete event
   * @param {Object} data - { agentId, content, stopReason }
   */
  onStreamingComplete(data) {
    if (data.agentId !== this.agentId) return;

    this.isStreaming = false;
    this.currentContent = data.content;
    this.updateContent(this.currentContent);

    // Update status based on stop reason
    const statusText = this.getStopReasonText(data.stopReason);
    this.updateStatus("completed", statusText);
  }

  /**
   * Get human-readable status text from stop reason
   * @param {string} stopReason
   * @returns {string}
   */
  getStopReasonText(stopReason) {
    const reasons = {
      end_turn: "Response complete",
      max_tokens: "Max tokens reached",
      max_turn_requests: "Max turn requests exceeded",
      refusal: "Agent refused to continue",
      cancelled: "Response cancelled",
    };
    return reasons[stopReason] || "Complete";
  }

  /**
   * Update the content display
   * @param {string} content
   */
  updateContent(content) {
    if (!this.responseContainer) return;

    // Clear and update with formatted content
    this.responseContainer.innerHTML = "";

    if (!content || content.trim() === "") {
      const emptyMessage = document.createElement("div");
      emptyMessage.className = "streaming-empty";
      emptyMessage.textContent = "No response yet...";
      this.responseContainer.appendChild(emptyMessage);
      return;
    }

    // Create content block with markdown-like formatting
    const contentBlock = document.createElement("div");
    contentBlock.className = "streaming-text";

    // Simple formatting: preserve line breaks and add basic styling
    const formattedContent = this.formatContent(content);
    contentBlock.innerHTML = formattedContent;

    this.responseContainer.appendChild(contentBlock);

    // Auto-scroll to bottom
    this.responseContainer.scrollTop = this.responseContainer.scrollHeight;

    // Add typing cursor if streaming
    if (this.isStreaming) {
      const cursor = document.createElement("span");
      cursor.className = "streaming-cursor";
      cursor.textContent = "▋";
      contentBlock.appendChild(cursor);
    }
  }

  /**
   * Format content with basic markdown-like styling
   * @param {string} content
   * @returns {string}
   */
  formatContent(content) {
    // Escape HTML
    const div = document.createElement("div");
    div.textContent = content;
    let formatted = div.innerHTML;

    // Convert newlines to <br>
    formatted = formatted.replace(/\n/g, "<br>");

    // Simple bold **text**
    formatted = formatted.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

    // Simple italic *text*
    formatted = formatted.replace(/\*(.+?)\*/g, "<em>$1</em>");

    // Simple code `text`
    formatted = formatted.replace(/`(.+?)`/g, "<code>$1</code>");

    return formatted;
  }

  /**
   * Clear the content display
   */
  clearContent() {
    if (!this.responseContainer) return;

    this.responseContainer.innerHTML = "";
    const emptyMessage = document.createElement("div");
    emptyMessage.className = "streaming-empty";
    emptyMessage.textContent = "Waiting for response...";
    this.responseContainer.appendChild(emptyMessage);
  }

  /**
   * Update the status indicator
   * @param {string} status - 'idle' | 'streaming' | 'completed' | 'error'
   * @param {string} text - Status text to display
   */
  updateStatus(status, text) {
    if (!this.statusIndicator || !this.statusText) return;

    // Remove all status classes
    this.statusIndicator.className = "streaming-status-indicator";

    // Add new status class
    this.statusIndicator.classList.add(`status-${status}`);
    this.statusText.textContent = text;
  }

  /**
   * Get current streaming state
   * @returns {boolean}
   */
  isCurrentlyStreaming() {
    return this.isStreaming;
  }

  /**
   * Get current content
   * @returns {string}
   */
  getCurrentContent() {
    return this.currentContent;
  }

  /**
   * Clear the streaming response
   */
  clear() {
    this.currentContent = "";
    this.isStreaming = false;
    this.clearContent();
    this.updateStatus("idle", "Idle");
  }

  /**
   * Destroy the component and clean up
   */
  destroy() {
    if (this.element) {
      this.element.remove();
      this.element = null;
    }
    this.responseContainer = null;
    this.statusIndicator = null;
    this.statusText = null;
    this.currentContent = "";
    this.isStreaming = false;
  }
}
