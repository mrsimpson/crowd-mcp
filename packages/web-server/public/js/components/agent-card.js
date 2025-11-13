import { LiveTerminal } from "./live-terminal.js";
import { MessageThread } from "./message-thread.js";
import { StreamingResponse } from "./streaming-response.js";

/**
 * AgentCard Component
 * Displays agent information and can expand to show live terminal, message inbox, and streaming responses
 */
export class AgentCard {
  constructor(agent, apiClient, onRemove) {
    this.agent = agent;
    this.apiClient = apiClient;
    this.onRemove = onRemove;
    this.element = null;
    this.terminal = null;
    this.messageThread = null;
    this.streamingResponse = null;
    this.messages = [];
    this.isExpanded = false;
    this.isStreaming = false;
  }

  /**
   * Create the card element
   * @returns {HTMLElement}
   */
  createElement() {
    const card = document.createElement("div");
    card.className = "agent-card";
    card.id = `agent-${this.agent.id}`;
    card.dataset.agentId = this.agent.id;

    this.render(card);
    this.element = card;

    return card;
  }

  /**
   * Render the card content
   * @param {HTMLElement} card
   */
  render(card) {
    // Filter to only received messages
    const receivedMessages = this.messages.filter(
      (m) => m.to === this.agent.id,
    );
    const totalMessages = receivedMessages.length;

    if (this.isExpanded) {
      card.classList.add("expanded");
      card.innerHTML = `
        <div class="agent-card-header expanded-header">
          <div class="agent-info-compact">
            <div class="agent-id-compact">${this.escapeHtml(this.agent.id)}</div>
            <div class="agent-task-compact">${this.escapeHtml(this.agent.task)}</div>
            <div class="agent-container-compact">Container: ${this.agent.containerId.substring(0, 12)}</div>
          </div>
            <div class="agent-header-actions">
              <div class="agent-badge">${this.getStatusBadge()}</div>
              <button class="btn-icon btn-collapse" title="Collapse" aria-label="Collapse agent card">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M3 8l5-5 5 5H3z"/>
              </svg>
            </button>
          </div>
        </div>
        <div class="agent-tabs">
          <button class="agent-tab active" data-tab="streaming">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0C3.6 0 0 3.6 0 8s3.6 8 8 8 8-3.6 8-8-3.6-8-8-8zm0 14c-3.3 0-6-2.7-6-6s2.7-6 6-6 6 2.7 6 6-2.7 6-6 6z"/>
              <path d="M6 5l5 3-5 3V5z"/>
            </svg>
            <span>Streaming</span>
            ${this.isStreaming ? `<span class="tab-badge streaming-badge">●</span>` : ""}
          </button>
          <button class="agent-tab" data-tab="inbox">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M0 2a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4.414a1 1 0 0 0-.707.293L1.414 14.586A1 1 0 0 1 0 13.828V2z"/>
            </svg>
            <span>Inbox</span>
            ${totalMessages > 0 ? `<span class="tab-badge">${totalMessages}</span>` : ""}
          </button>
          <button class="agent-tab" data-tab="logs">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M0 2a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H1a1 1 0 0 1-1-1V2zm1 0v12h14V2H1zm2 2h10v1H3V4zm0 3h10v1H3V7zm0 3h10v1H3v-1z"/>
            </svg>
            <span>Logs</span>
          </button>
        </div>
        <div class="agent-tab-content">
          <div class="agent-tab-pane active" data-pane="streaming">
            <div class="agent-streaming-container">
              <!-- Streaming response will be inserted here -->
            </div>
          </div>
          <div class="agent-tab-pane" data-pane="inbox">
            <div class="agent-inbox-container">
              <div class="agent-inbox-messages">
                <!-- Messages will be inserted here -->
              </div>
            </div>
          </div>
          <div class="agent-tab-pane" data-pane="logs">
            <div class="agent-terminal-container">
              <!-- Terminal will be inserted here -->
            </div>
          </div>
        </div>
        <div class="agent-card-footer">
          <button class="btn btn-stop">Stop Agent</button>
        </div>
      `;
    } else {
      card.classList.remove("expanded");
      card.innerHTML = `
        <div class="agent-card-body">
          <div class="agent-card-header">
            <div class="agent-id">${this.escapeHtml(this.agent.id)}</div>
            <div class="agent-header-badges">
              <div class="agent-badge">${this.getStatusBadge()}</div>
              ${this.isStreaming ? `<div class="agent-streaming-badge" title="Agent is streaming">●</div>` : ""}
              ${totalMessages > 0 ? `<div class="agent-message-badge" title="${totalMessages} message${totalMessages !== 1 ? "s" : ""}">${totalMessages}</div>` : ""}
            </div>
          </div>
          <div class="agent-task">${this.escapeHtml(this.agent.task)}</div>
          <div class="agent-meta">Container: ${this.agent.containerId.substring(0, 12)}</div>
          ${totalMessages > 0 ? `<div class="agent-message-preview">${this.getLatestMessagePreview(receivedMessages)}</div>` : ""}
        </div>
        <div class="agent-actions">
          <button class="btn btn-stop" onclick="event.stopPropagation()">Stop</button>
        </div>
      `;
    }

    this.attachEventListeners(card);
  }

  /**
   * Attach event listeners to the card
   * @param {HTMLElement} card
   */
  attachEventListeners(card) {
    // Make card body clickable to expand (when collapsed)
    const cardBody = card.querySelector(".agent-card-body");
    if (cardBody) {
      cardBody.addEventListener("click", () => this.expand());
      cardBody.style.cursor = "pointer";
    }

    // Collapse button
    const collapseBtn = card.querySelector(".btn-collapse");
    if (collapseBtn) {
      collapseBtn.addEventListener("click", () => this.collapse());
    }

    // Stop button
    const stopBtn = card.querySelector(".btn-stop");
    if (stopBtn) {
      stopBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.handleStop();
      });
    }

    // Tab switching
    const tabButtons = card.querySelectorAll(".agent-tab");
    tabButtons.forEach((tab) => {
      tab.addEventListener("click", () => this.switchTab(tab.dataset.tab));
    });
  }

  /**
   * Switch between tabs
   * @param {string} tabName
   */
  switchTab(tabName) {
    if (!this.isExpanded) return;

    // Update tab buttons
    const tabButtons = this.element.querySelectorAll(".agent-tab");
    tabButtons.forEach((tab) => {
      if (tab.dataset.tab === tabName) {
        tab.classList.add("active");
      } else {
        tab.classList.remove("active");
      }
    });

    // Update tab panes
    const tabPanes = this.element.querySelectorAll(".agent-tab-pane");
    tabPanes.forEach((pane) => {
      if (pane.dataset.pane === tabName) {
        pane.classList.add("active");
      } else {
        pane.classList.remove("active");
      }
    });
  }

  /**
   * Expand the card to show streaming, terminal, and inbox
   */
  expand() {
    if (this.isExpanded) return;

    this.isExpanded = true;
    this.render(this.element);

    // Filter to only received messages
    const receivedMessages = this.messages.filter(
      (m) => m.to === this.agent.id,
    );

    // Create and insert streaming response component for streaming tab
    this.streamingResponse = new StreamingResponse();
    this.streamingResponse.setAgentId(this.agent.id);
    const streamingElement = this.streamingResponse.createElement();

    const streamingContainer = this.element.querySelector(
      ".agent-streaming-container",
    );
    streamingContainer.appendChild(streamingElement);

    // Create and insert message thread for inbox tab
    this.messageThread = new MessageThread(this.agent.id, receivedMessages);
    const messageThreadElement = this.messageThread.createElement();

    const inboxContainer = this.element.querySelector(".agent-inbox-messages");
    inboxContainer.appendChild(messageThreadElement);

    // Auto-expand if there are messages
    if (receivedMessages.length > 0) {
      this.messageThread.expand();
    }

    // Create and insert terminal for logs tab
    this.terminal = new LiveTerminal(this.apiClient);
    const terminalElement = this.terminal.createElement();

    const terminalContainer = this.element.querySelector(
      ".agent-terminal-container",
    );
    terminalContainer.appendChild(terminalElement);

    // Start streaming logs
    this.terminal.startStreaming(this.agent.id);

    // Add animation class
    this.element.classList.add("expanding");
    setTimeout(() => {
      this.element.classList.remove("expanding");
    }, 300);
  }

  /**
   * Collapse the card
   */
  collapse() {
    if (!this.isExpanded) return;

    this.isExpanded = false;

    // Clean up streaming response
    if (this.streamingResponse) {
      this.streamingResponse.destroy();
      this.streamingResponse = null;
    }

    // Clean up terminal
    if (this.terminal) {
      this.terminal.destroy();
      this.terminal = null;
    }

    // Clean up message thread
    if (this.messageThread) {
      this.messageThread.destroy();
      this.messageThread = null;
    }

    this.render(this.element);

    // Add animation class
    this.element.classList.add("collapsing");
    setTimeout(() => {
      this.element.classList.remove("collapsing");
    }, 300);
  }

  /**
   * Handle agent stop
   */
  async handleStop() {
    const confirmed = confirm(
      `Stop agent "${this.agent.id}"?\n\nTask: ${this.agent.task}\n\nThis will stop and remove the container.`,
    );

    if (!confirmed) return;

    // Disable buttons
    const buttons = this.element.querySelectorAll("button");
    buttons.forEach((btn) => (btn.disabled = true));

    try {
      await this.apiClient.stopAgent(this.agent.id);
      // The agent:removed event will trigger removal via onRemove callback
    } catch (error) {
      // Re-enable buttons on error
      buttons.forEach((btn) => (btn.disabled = false));
      alert(`Error stopping agent: ${error.message}`);
    }
  }

  /**
   * Update the agent data
   * @param {Object} agent
   */
  update(agent) {
    this.agent = agent;

    // Update task text if not expanded
    if (!this.isExpanded) {
      const taskElement = this.element.querySelector(".agent-task");
      if (taskElement) {
        taskElement.textContent = this.escapeHtml(agent.task);
      }
    } else {
      const taskElement = this.element.querySelector(".agent-task-compact");
      if (taskElement) {
        taskElement.textContent = this.escapeHtml(agent.task);
      }
    }
  }

  /**
   * Set messages for this agent
   * @param {Array} messages
   */
  setMessages(messages) {
    this.messages = messages;

    // Update the UI if not expanded
    if (!this.isExpanded && this.element) {
      this.render(this.element);
    }
  }

  /**
   * Add a new message to this agent
   * @param {Object} message
   */
  addMessage(message) {
    this.messages.push(message);

    // If expanded and message is received, add to message thread
    if (this.isExpanded && this.messageThread && message.to === this.agent.id) {
      this.messageThread.addMessage(message);

      // Update the inbox tab badge
      this.updateInboxBadge();
    }

    // Update the UI if not expanded
    if (!this.isExpanded && this.element) {
      this.render(this.element);
    }
  }

  /**
   * Update the inbox tab badge count
   */
  updateInboxBadge() {
    if (!this.isExpanded || !this.element) return;

    const receivedMessages = this.messages.filter(
      (m) => m.to === this.agent.id,
    );
    const totalMessages = receivedMessages.length;

    const inboxTab = this.element.querySelector('.agent-tab[data-tab="inbox"]');
    if (!inboxTab) return;

    // Remove existing badge
    const existingBadge = inboxTab.querySelector(".tab-badge");
    if (existingBadge) {
      existingBadge.remove();
    }

    // Add new badge if there are messages
    if (totalMessages > 0) {
      const badge = document.createElement("span");
      badge.className = "tab-badge";
      badge.textContent = totalMessages;
      inboxTab.appendChild(badge);
    }
  }

  /**
   * Get preview of latest message for collapsed view
   * @param {Array} messages - Filtered messages array
   * @returns {string}
   */
  getLatestMessagePreview(messages) {
    if (messages.length === 0) return "";

    const latestMessage = messages[messages.length - 1];
    const preview =
      latestMessage.content.length > 60
        ? latestMessage.content.substring(0, 60) + "..."
        : latestMessage.content;

    const priorityIcon =
      latestMessage.priority === "high"
        ? "⚠️"
        : latestMessage.priority === "low"
          ? "↓"
          : "•";

    return `
      <div class="message-preview-content">
        <span class="message-preview-icon">${priorityIcon}</span>
        <span class="message-preview-from">From: ${this.escapeHtml(latestMessage.from)}</span>
        <span class="message-preview-text">${this.escapeHtml(preview)}</span>
      </div>
    `;
  }

  /**
   * Handle streaming start event
   * @param {Object} data - { agentId, prompt }
   */
  onStreamingStart(data) {
    if (data.agentId !== this.agent.id) return;

    this.isStreaming = true;

    // Update streaming indicator in collapsed view
    if (!this.isExpanded && this.element) {
      this.render(this.element);
    }

    // Forward to streaming response component if expanded
    if (this.streamingResponse) {
      this.streamingResponse.onStreamingStart(data);
    }

    // Update streaming tab badge if expanded
    this.updateStreamingBadge();
  }

  /**
   * Handle streaming chunk event
   * @param {Object} data - { agentId, chunk, accumulated }
   */
  onStreamingChunk(data) {
    if (data.agentId !== this.agent.id) return;

    // Forward to streaming response component if expanded
    if (this.streamingResponse) {
      this.streamingResponse.onStreamingChunk(data);
    }
  }

  /**
   * Handle streaming complete event
   * @param {Object} data - { agentId, content, stopReason }
   */
  onStreamingComplete(data) {
    if (data.agentId !== this.agent.id) return;

    this.isStreaming = false;

    // Update streaming indicator in collapsed view
    if (!this.isExpanded && this.element) {
      this.render(this.element);
    }

    // Forward to streaming response component if expanded
    if (this.streamingResponse) {
      this.streamingResponse.onStreamingComplete(data);
    }

    // Update streaming tab badge if expanded
    this.updateStreamingBadge();
  }

  /**
   * Update the streaming tab badge
   */
  updateStreamingBadge() {
    if (!this.isExpanded || !this.element) return;

    const streamingTab = this.element.querySelector(
      '.agent-tab[data-tab="streaming"]',
    );
    if (!streamingTab) return;

    // Remove existing badge
    const existingBadge = streamingTab.querySelector(".streaming-badge");
    if (existingBadge) {
      existingBadge.remove();
    }

    // Add new badge if streaming is active
    if (this.isStreaming) {
      const badge = document.createElement("span");
      badge.className = "tab-badge streaming-badge";
      badge.textContent = "●";
      streamingTab.appendChild(badge);
    }
  }

  /**
   * Remove the card and clean up
   */
  remove() {
    // Clean up streaming response if exists
    if (this.streamingResponse) {
      this.streamingResponse.destroy();
      this.streamingResponse = null;
    }

    // Clean up terminal if exists
    if (this.terminal) {
      this.terminal.destroy();
      this.terminal = null;
    }

    // Clean up message thread if exists
    if (this.messageThread) {
      this.messageThread.destroy();
      this.messageThread = null;
    }

    // Remove element from DOM
    if (this.element) {
      this.element.classList.add("removing");
      setTimeout(() => {
        this.element.remove();
        this.element = null;

        // Notify parent
        if (this.onRemove) {
          this.onRemove(this.agent.id);
        }
      }, 300);
    }
  }

  /**
   * Get status badge HTML based on agent status
   * @returns {string}
   */
  getStatusBadge() {
    const status = this.agent.status || "idle";
    const statusConfig = {
      initializing: { text: "Initializing", class: "status-initializing" },
      idle: { text: "Running", class: "status-running" },
      working: { text: "Working", class: "status-working" },
      blocked: { text: "Blocked", class: "status-blocked" },
      stopped: { text: "Stopped", class: "status-stopped" },
    };

    const config = statusConfig[status] || statusConfig.idle;
    return `<span class="status-badge ${config.class}">${config.text}</span>`;
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
}
