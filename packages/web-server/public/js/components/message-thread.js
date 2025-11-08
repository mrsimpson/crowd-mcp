import { MessageItem } from "./message-item.js";

/**
 * MessageThread Component
 * Displays a conversation thread for a specific participant
 */
export class MessageThread {
  constructor(participantId, messages = []) {
    this.participantId = participantId;
    this.messages = [...messages];
    this.element = null;
    this.messageItems = [];
    this.isExpanded = false;
    this.isVisible = true;
    this.messagesContainer = null;
  }

  /**
   * Create the thread element
   * @returns {HTMLElement}
   */
  createElement() {
    const thread = document.createElement("div");
    thread.className = "message-thread";
    thread.dataset.participantId = this.participantId;

    const messageCount = this.messages.length;
    const latestMessage = this.messages[this.messages.length - 1];
    const unreadCount = this.messages.filter((m) => !m.read).length;

    thread.innerHTML = `
      <div class="message-thread-header">
        <div class="thread-info">
          <div class="thread-participant">${this.escapeHtml(this.participantId)}</div>
          <div class="thread-meta">
            ${messageCount} message${messageCount !== 1 ? "s" : ""}
            ${unreadCount > 0 ? `• ${unreadCount} unread` : ""}
          </div>
        </div>
        <div class="thread-actions">
          <div class="thread-timestamp">${this.formatTimestamp(latestMessage?.timestamp)}</div>
          <button class="btn-icon btn-expand" title="Expand thread" aria-label="Expand message thread">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M3 6l5 5 5-5H3z"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="message-thread-preview">
        ${latestMessage ? this.createMessagePreview(latestMessage) : "No messages"}
      </div>
      <div class="message-thread-messages" style="display: none;">
        <!-- Messages will be inserted here when expanded -->
      </div>
    `;

    this.element = thread;
    this.messagesContainer = thread.querySelector(".message-thread-messages");

    this.attachEventListeners();

    return thread;
  }

  /**
   * Create a preview of the latest message
   */
  createMessagePreview(message) {
    const preview =
      message.content.length > 100
        ? message.content.substring(0, 100) + "..."
        : message.content;

    const priorityClass = `priority-${message.priority}`;

    return `
      <div class="message-preview ${priorityClass}">
        <span class="message-from">From: ${this.escapeHtml(message.from)}</span>
        <span class="message-content">${this.escapeHtml(preview)}</span>
      </div>
    `;
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    const expandBtn = this.element.querySelector(".btn-expand");
    const header = this.element.querySelector(".message-thread-header");

    const toggleExpanded = () => {
      if (this.isExpanded) {
        this.collapse();
      } else {
        this.expand();
      }
    };

    expandBtn.addEventListener("click", toggleExpanded);
    header.addEventListener("click", toggleExpanded);
  }

  /**
   * Expand the thread to show all messages
   */
  expand() {
    if (this.isExpanded) return;

    this.isExpanded = true;
    this.element.classList.add("expanded");

    // Update expand button
    const expandBtn = this.element.querySelector(".btn-expand");
    expandBtn.title = "Collapse thread";
    expandBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M3 10l5-5 5 5H3z"/>
      </svg>
    `;

    // Show messages container
    this.messagesContainer.style.display = "block";

    // Hide preview
    const preview = this.element.querySelector(".message-thread-preview");
    preview.style.display = "none";

    // Render all messages if not already done
    if (this.messageItems.length === 0) {
      this.renderMessages();
    }
  }

  /**
   * Collapse the thread
   */
  collapse() {
    if (!this.isExpanded) return;

    this.isExpanded = false;
    this.element.classList.remove("expanded");

    // Update expand button
    const expandBtn = this.element.querySelector(".btn-expand");
    expandBtn.title = "Expand thread";
    expandBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M3 6l5 5 5-5H3z"/>
      </svg>
    `;

    // Hide messages container
    this.messagesContainer.style.display = "none";

    // Show preview
    const preview = this.element.querySelector(".message-thread-preview");
    preview.style.display = "block";
  }

  /**
   * Render all messages in the thread
   */
  renderMessages() {
    this.messagesContainer.innerHTML = "";
    this.messageItems = [];

    // Sort messages by timestamp (oldest first for chronological display)
    const sortedMessages = [...this.messages].sort(
      (a, b) => a.timestamp - b.timestamp,
    );

    sortedMessages.forEach((message) => {
      const messageItem = new MessageItem(message);
      const messageElement = messageItem.createElement();

      this.messagesContainer.appendChild(messageElement);
      this.messageItems.push(messageItem);
    });
  }

  /**
   * Add a new message to the thread
   */
  addMessage(message) {
    this.messages.push(message);

    // Update header meta
    this.updateHeader();

    // Update preview
    this.updatePreview(message);

    // If expanded, add the message to the display
    if (this.isExpanded) {
      const messageItem = new MessageItem(message);
      const messageElement = messageItem.createElement();

      this.messagesContainer.appendChild(messageElement);
      this.messageItems.push(messageItem);

      // Scroll to bottom
      this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }
  }

  /**
   * Update header with current message counts
   */
  updateHeader() {
    const messageCount = this.messages.length;
    const unreadCount = this.messages.filter((m) => !m.read).length;

    const metaElement = this.element.querySelector(".thread-meta");
    metaElement.textContent = `${messageCount} message${messageCount !== 1 ? "s" : ""}${unreadCount > 0 ? ` • ${unreadCount} unread` : ""}`;

    const latestMessage = this.messages[this.messages.length - 1];
    const timestampElement = this.element.querySelector(".thread-timestamp");
    timestampElement.textContent = this.formatTimestamp(
      latestMessage?.timestamp,
    );
  }

  /**
   * Update preview with latest message
   */
  updatePreview(message) {
    const previewElement = this.element.querySelector(
      ".message-thread-preview",
    );
    previewElement.innerHTML = this.createMessagePreview(message);
  }

  /**
   * Check if thread matches priority filter
   */
  matchesPriorityFilter(priority) {
    if (priority === "all") return true;
    return this.messages.some((message) => message.priority === priority);
  }

  /**
   * Set thread visibility
   */
  setVisible(visible) {
    this.isVisible = visible;
    this.element.style.display = visible ? "block" : "none";
  }

  /**
   * Check if thread is visible
   */
  isVisible() {
    return this.isVisible;
  }

  /**
   * Format timestamp for display
   */
  formatTimestamp(timestamp) {
    if (!timestamp) return "";

    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    // Less than 1 minute
    if (diff < 60000) {
      return "Just now";
    }

    // Less than 1 hour
    if (diff < 3600000) {
      const minutes = Math.floor(diff / 60000);
      return `${minutes} minute${minutes !== 1 ? "s" : ""} ago`;
    }

    // Less than 24 hours
    if (diff < 86400000) {
      const hours = Math.floor(diff / 3600000);
      return `${hours} hour${hours !== 1 ? "s" : ""} ago`;
    }

    // More than 24 hours - show date
    return date.toLocaleDateString();
  }

  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Destroy the thread and clean up
   */
  destroy() {
    this.messageItems.forEach((item) => item.destroy());
    this.messageItems = [];

    if (this.element) {
      this.element.remove();
      this.element = null;
    }
  }
}
