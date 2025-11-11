import { MessageItem } from "./message-item.js";

/**
 * AgentMessagesView Component
 * Displays ACP message interactions for a specific agent
 */
export class AgentMessagesView {
  constructor(agentId, apiClient, eventStream) {
    this.agentId = agentId;
    this.apiClient = apiClient;
    this.eventStream = eventStream;
    this.element = null;
    this.messages = new Map(); // messageId -> MessageItem
    this.messagesContainer = null;
    this.emptyState = null;
    this.messageListener = null;
  }

  /**
   * Create the view element
   * @returns {HTMLElement}
   */
  createElement() {
    const view = document.createElement("div");
    view.className = "agent-messages-view";

    view.innerHTML = `
      <div class="agent-messages-header">
        <h3>ACP Message Interactions</h3>
        <button class="btn-icon btn-refresh" title="Refresh messages" aria-label="Refresh messages">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M13.65 2.35A7.5 7.5 0 0 0 2.5 8H1a9 9 0 0 1 15-6.3v-1.2h1.5v4h-4v-1.5h2.15zM2.35 13.65A7.5 7.5 0 0 0 13.5 8H15a9 9 0 0 1-15 6.3v1.2H-1.5v-4h4v1.5H.35z"/>
          </svg>
        </button>
      </div>
      <div class="agent-messages-content">
        <div class="agent-messages-list">
          <!-- Messages will be inserted here -->
        </div>
        <div class="agent-messages-empty" style="display: none;">
          <p>No ACP messages yet</p>
          <p class="empty-hint">Messages sent to and from this agent will appear here</p>
        </div>
      </div>
    `;

    this.element = view;
    this.messagesContainer = view.querySelector(".agent-messages-list");
    this.emptyState = view.querySelector(".agent-messages-empty");

    this.attachEventListeners();
    this.loadMessages();
    this.setupRealtimeUpdates();

    return view;
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    const refreshBtn = this.element.querySelector(".btn-refresh");
    if (refreshBtn) {
      refreshBtn.addEventListener("click", () => this.refresh());
    }
  }

  /**
   * Load messages from the API
   */
  async loadMessages() {
    try {
      const response = await this.apiClient.getMessages({
        participant: this.agentId,
        limit: 100,
      });

      // Clear existing messages
      this.messages.clear();
      this.messagesContainer.innerHTML = "";

      // Add messages in chronological order (oldest first for conversation flow)
      const sortedMessages = response.messages.sort(
        (a, b) => a.timestamp - b.timestamp,
      );

      sortedMessages.forEach((message) => {
        this.addMessage(message, false);
      });

      this.updateEmptyState();
    } catch (error) {
      console.error("Failed to load agent messages:", error);
      this.showError("Failed to load messages");
    }
  }

  /**
   * Set up real-time message updates
   */
  setupRealtimeUpdates() {
    this.messageListener = (message) => {
      // Only show messages involving this agent
      if (message.from === this.agentId || message.to === this.agentId) {
        this.addMessage(message, true);
        this.updateEmptyState();
      }
    };

    this.eventStream.on("message:sent", this.messageListener);
  }

  /**
   * Add a message to the view
   * @param {Object} message
   * @param {boolean} animate - Whether to animate the addition
   */
  addMessage(message, animate = false) {
    // Don't add duplicates
    if (this.messages.has(message.id)) {
      return;
    }

    const messageItem = new MessageItem(message);
    const messageElement = messageItem.createElement();

    // Append to end (chronological order)
    this.messagesContainer.appendChild(messageElement);

    this.messages.set(message.id, messageItem);

    if (animate) {
      messageElement.classList.add("new");
      // Auto-scroll to the new message
      setTimeout(() => {
        messageElement.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }, 100);
    }
  }

  /**
   * Update empty state visibility
   */
  updateEmptyState() {
    if (this.messages.size === 0) {
      this.messagesContainer.style.display = "none";
      this.emptyState.style.display = "flex";
    } else {
      this.messagesContainer.style.display = "block";
      this.emptyState.style.display = "none";
    }
  }

  /**
   * Show error message
   * @param {string} message
   */
  showError(message) {
    this.emptyState.innerHTML = `
      <p style="color: #ef4444;">Error</p>
      <p class="empty-hint">${this.escapeHtml(message)}</p>
    `;
    this.emptyState.style.display = "flex";
    this.messagesContainer.style.display = "none";
  }

  /**
   * Refresh messages
   */
  async refresh() {
    const refreshBtn = this.element.querySelector(".btn-refresh");
    if (refreshBtn) {
      refreshBtn.disabled = true;
      refreshBtn.classList.add("spinning");
    }

    await this.loadMessages();

    setTimeout(() => {
      if (refreshBtn) {
        refreshBtn.disabled = false;
        refreshBtn.classList.remove("spinning");
      }
    }, 500);
  }

  /**
   * Escape HTML to prevent XSS
   * @param {string} text
   * @returns {string}
   */
  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Destroy the view and clean up
   */
  destroy() {
    // Remove event listener
    if (this.messageListener) {
      this.eventStream.off("message:sent", this.messageListener);
      this.messageListener = null;
    }

    // Clean up messages
    this.messages.forEach((messageItem) => messageItem.destroy());
    this.messages.clear();

    // Remove element
    if (this.element) {
      this.element.remove();
      this.element = null;
    }
  }
}
