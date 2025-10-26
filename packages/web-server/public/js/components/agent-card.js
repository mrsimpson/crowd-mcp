import { LiveTerminal } from "./live-terminal.js";

/**
 * AgentCard Component
 * Displays agent information and can expand to show live terminal
 */
export class AgentCard {
  constructor(agent, apiClient, onRemove) {
    this.agent = agent;
    this.apiClient = apiClient;
    this.onRemove = onRemove;
    this.element = null;
    this.terminal = null;
    this.isExpanded = false;
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
        <div class="agent-terminal-container">
          <!-- Terminal will be inserted here -->
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
          <button class="btn btn-logs">View Logs</button>
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
    // Expand/View Logs button
    const viewLogsBtn = card.querySelector(".btn-logs");
    if (viewLogsBtn) {
      viewLogsBtn.addEventListener("click", () => this.expand());
    }

    // Collapse button
    const collapseBtn = card.querySelector(".btn-collapse");
    if (collapseBtn) {
      collapseBtn.addEventListener("click", () => this.collapse());
    }

    // Stop button
    const stopBtn = card.querySelector(".btn-stop");
    if (stopBtn) {
      stopBtn.addEventListener("click", () => this.handleStop());
    }
  }

  /**
   * Expand the card to show terminal
   */
  expand() {
    if (this.isExpanded) return;

    this.isExpanded = true;
    this.render(this.element);

    // Create and insert terminal
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
