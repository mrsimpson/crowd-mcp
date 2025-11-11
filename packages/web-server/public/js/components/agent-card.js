import { LiveTerminal } from "./live-terminal.js";
import { AgentMessagesView } from "./agent-messages-view.js";

/**
 * AgentCard Component
 * Displays agent information and can expand to show ACP messages and logs
 */
export class AgentCard {
  constructor(agent, apiClient, eventStream, onRemove) {
    this.agent = agent;
    this.apiClient = apiClient;
    this.eventStream = eventStream;
    this.onRemove = onRemove;
    this.element = null;
    this.messagesView = null;
    this.terminal = null;
    this.isExpanded = false;
    this.activeTab = "messages"; // 'messages' or 'logs'
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
            <div class="agent-badge">Running</div>
            <button class="btn-icon btn-collapse" title="Collapse" aria-label="Collapse agent card">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M3 8l5-5 5 5H3z"/>
              </svg>
            </button>
          </div>
        </div>
        <div class="agent-tabs">
          <button class="agent-tab ${this.activeTab === "messages" ? "active" : ""}" data-tab="messages">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style="margin-right: 6px;">
              <path d="M2 2h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-3l-3 3-3-3H2a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"/>
            </svg>
            Messages
          </button>
          <button class="agent-tab ${this.activeTab === "logs" ? "active" : ""}" data-tab="logs">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style="margin-right: 6px;">
              <path d="M0 2h16v2H0V2zm0 4h16v2H0V6zm0 4h16v2H0v-2zm0 4h16v2H0v-2z"/>
            </svg>
            Container Logs
          </button>
        </div>
        <div class="agent-content-container">
          <div class="agent-tab-content ${this.activeTab === "messages" ? "active" : ""}" data-content="messages">
            <!-- Messages view will be inserted here -->
          </div>
          <div class="agent-tab-content ${this.activeTab === "logs" ? "active" : ""}" data-content="logs">
            <!-- Terminal will be inserted here -->
          </div>
        </div>
        <div class="agent-card-footer">
          <button class="btn btn-stop">Stop Agent</button>
        </div>
      `;
    } else {
      card.classList.remove("expanded");
      card.innerHTML = `
        <div class="agent-card-header">
          <div class="agent-id">${this.escapeHtml(this.agent.id)}</div>
          <div class="agent-badge">Running</div>
        </div>
        <div class="agent-task">${this.escapeHtml(this.agent.task)}</div>
        <div class="agent-meta">Container: ${this.agent.containerId.substring(0, 12)}</div>
        <div class="agent-actions">
          <button class="btn btn-view">View Details</button>
          <button class="btn btn-stop">Stop</button>
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
    // Expand/View Details button
    const viewBtn = card.querySelector(".btn-view");
    if (viewBtn) {
      viewBtn.addEventListener("click", () => this.expand());
    }

    // Collapse button
    const collapseBtn = card.querySelector(".btn-collapse");
    if (collapseBtn) {
      collapseBtn.addEventListener("click", () => this.collapse());
    }

    // Tab buttons
    const tabButtons = card.querySelectorAll(".agent-tab");
    tabButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const tab = btn.dataset.tab;
        this.switchTab(tab);
      });
    });

    // Stop button
    const stopBtn = card.querySelector(".btn-stop");
    if (stopBtn) {
      stopBtn.addEventListener("click", () => this.handleStop());
    }
  }

  /**
   * Expand the card to show messages and logs
   */
  expand() {
    if (this.isExpanded) return;

    this.isExpanded = true;
    this.activeTab = "messages"; // Default to messages tab
    this.render(this.element);

    // Create and insert messages view
    this.messagesView = new AgentMessagesView(
      this.agent.id,
      this.apiClient,
      this.eventStream,
    );
    const messagesElement = this.messagesView.createElement();

    const messagesContainer = this.element.querySelector(
      '[data-content="messages"]',
    );
    messagesContainer.appendChild(messagesElement);

    // Create terminal but don't start it yet (only when logs tab is clicked)
    this.terminal = new LiveTerminal(this.apiClient);
    const terminalElement = this.terminal.createElement();

    const logsContainer = this.element.querySelector('[data-content="logs"]');
    logsContainer.appendChild(terminalElement);

    // Add animation class
    this.element.classList.add("expanding");
    setTimeout(() => {
      this.element.classList.remove("expanding");
    }, 300);
  }

  /**
   * Switch between tabs
   * @param {string} tab - 'messages' or 'logs'
   */
  switchTab(tab) {
    if (this.activeTab === tab) return;

    this.activeTab = tab;

    // Update tab buttons
    const tabButtons = this.element.querySelectorAll(".agent-tab");
    tabButtons.forEach((btn) => {
      if (btn.dataset.tab === tab) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });

    // Update tab content
    const tabContents = this.element.querySelectorAll(".agent-tab-content");
    tabContents.forEach((content) => {
      if (content.dataset.content === tab) {
        content.classList.add("active");
      } else {
        content.classList.remove("active");
      }
    });

    // Start streaming logs when logs tab is first opened
    if (tab === "logs" && this.terminal && !this.terminal.isStreaming) {
      this.terminal.startStreaming(this.agent.id);
    }
  }

  /**
   * Collapse the card
   */
  collapse() {
    if (!this.isExpanded) return;

    this.isExpanded = false;

    // Clean up messages view
    if (this.messagesView) {
      this.messagesView.destroy();
      this.messagesView = null;
    }

    // Clean up terminal
    if (this.terminal) {
      this.terminal.destroy();
      this.terminal = null;
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
   * Remove the card and clean up
   */
  remove() {
    // Clean up messages view if exists
    if (this.messagesView) {
      this.messagesView.destroy();
      this.messagesView = null;
    }

    // Clean up terminal if exists
    if (this.terminal) {
      this.terminal.destroy();
      this.terminal = null;
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
