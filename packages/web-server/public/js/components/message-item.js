/**
 * MessageItem Component
 * Displays an individual message with priority indicators and metadata
 */
export class MessageItem {
  constructor(message) {
    this.message = message;
    this.element = null;
  }

  /**
   * Create the message element
   * @returns {HTMLElement}
   */
  createElement() {
    const item = document.createElement("div");
    item.className = `message-item priority-${this.message.priority}${this.message.read ? "" : " unread"}`;
    item.dataset.messageId = this.message.id;

    const priorityIcon = this.getPriorityIcon(this.message.priority);
    const priorityLabel =
      this.message.priority.charAt(0).toUpperCase() +
      this.message.priority.slice(1);

    item.innerHTML = `
      <div class="message-header">
        <div class="message-from">
          <strong>${this.escapeHtml(this.message.from)}</strong>
          <span class="message-direction">→</span>
          <strong>${this.escapeHtml(this.message.to)}</strong>
        </div>
        <div class="message-meta">
          <div class="message-priority" title="${priorityLabel} Priority">
            ${priorityIcon}
            <span class="priority-label">${priorityLabel}</span>
          </div>
          <div class="message-timestamp" title="${new Date(this.message.timestamp).toLocaleString()}">
            ${this.formatTimestamp(this.message.timestamp)}
          </div>
        </div>
      </div>
      <div class="message-content">
        ${this.formatContent(this.message.content)}
      </div>
      ${!this.message.read ? '<div class="message-unread-indicator" title="Unread"></div>' : ""}
    `;

    this.element = item;
    return item;
  }

  /**
   * Get priority icon SVG
   */
  getPriorityIcon(priority) {
    switch (priority) {
      case "high":
        return `
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" class="priority-icon priority-high">
            <path d="M8 1l2.5 5h5L11 10l1.5 5L8 12l-4.5 3L5 10 0.5 6h5L8 1z"/>
          </svg>
        `;
      case "normal":
        return `
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" class="priority-icon priority-normal">
            <circle cx="8" cy="8" r="6"/>
          </svg>
        `;
      case "low":
        return `
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" class="priority-icon priority-low">
            <path d="M8 12l-4-4h8l-4 4z"/>
          </svg>
        `;
      default:
        return `
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" class="priority-icon">
            <circle cx="8" cy="8" r="4"/>
          </svg>
        `;
    }
  }

  /**
   * Format message content with basic parsing
   */
  formatContent(content) {
    let formatted = this.escapeHtml(content);

    // Simple formatting for common patterns

    // Make URLs clickable (basic pattern)
    formatted = formatted.replace(
      /(https?:\/\/[^\s]+)/g,
      '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>',
    );

    // Basic markdown-style formatting

    // Bold text **text**
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");

    // Italic text *text*
    formatted = formatted.replace(/\*(.*?)\*/g, "<em>$1</em>");

    // Code blocks ```code```
    formatted = formatted.replace(
      /```([\s\S]*?)```/g,
      "<pre><code>$1</code></pre>",
    );

    // Inline code `code`
    formatted = formatted.replace(/`([^`]+)`/g, "<code>$1</code>");

    // Line breaks
    formatted = formatted.replace(/\n/g, "<br>");

    return formatted;
  }

  /**
   * Format timestamp for display
   */
  formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    // Less than 1 minute
    if (diff < 60000) {
      return "now";
    }

    // Less than 1 hour
    if (diff < 3600000) {
      const minutes = Math.floor(diff / 60000);
      return `${minutes}m`;
    }

    // Less than 24 hours
    if (diff < 86400000) {
      const hours = Math.floor(diff / 3600000);
      return `${hours}h`;
    }

    // Less than 7 days
    if (diff < 604800000) {
      const days = Math.floor(diff / 86400000);
      return `${days}d`;
    }

    // More than 7 days - show date
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  }

  /**
   * Update the message data
   * @param {Object} message
   */
  update(message) {
    this.message = message;

    // Update read status
    if (message.read && this.element.classList.contains("unread")) {
      this.element.classList.remove("unread");
      const unreadIndicator = this.element.querySelector(
        ".message-unread-indicator",
      );
      if (unreadIndicator) {
        unreadIndicator.remove();
      }
    }

    // Update timestamp
    const timestampElement = this.element.querySelector(".message-timestamp");
    if (timestampElement) {
      timestampElement.textContent = this.formatTimestamp(message.timestamp);
      timestampElement.title = new Date(message.timestamp).toLocaleString();
    }
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
   * Destroy the message item and clean up
   */
  destroy() {
    if (this.element) {
      this.element.remove();
      this.element = null;
    }
  }
}
