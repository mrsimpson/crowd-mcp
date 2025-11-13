import { MessageThread } from "./message-thread.js";

/**
 * MessagesPanel Component
 * Displays all message threads and provides filtering capabilities
 */
export class MessagesPanel {
  constructor(apiClient, eventStream) {
    this.apiClient = apiClient;
    this.eventStream = eventStream;
    this.element = null;
    this.threads = new Map(); // participantId -> MessageThread
    this.filterElement = null;
    this.threadsContainer = null;
    this.isLoading = false;
    this.currentFilter = {
      participant: "all",
      priority: "all",
    };
  }

  /**
   * Create the panel element
   * @returns {HTMLElement}
   */
  createElement() {
    const panel = document.createElement("div");
    panel.className = "messages-panel";
    panel.innerHTML = `
      <div class="messages-panel-header">
        <h2>Developer Inbox</h2>
        <div class="messages-filter">
          <select id="participant-filter" class="filter-select">
            <option value="all">All Senders</option>
          </select>
          <select id="priority-filter" class="filter-select">
            <option value="all">All Priorities</option>
            <option value="high">High Priority</option>
            <option value="normal">Normal Priority</option>
            <option value="low">Low Priority</option>
          </select>
          <button class="btn btn-refresh" title="Refresh Messages">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 2.5c-3.038 0-5.5 2.462-5.5 5.5s2.462 5.5 5.5 5.5c3.037 0 5.5-2.462 5.5-5.5h-1c0 2.485-2.015 4.5-4.5 4.5S3.5 10.485 3.5 8 5.515 3.5 8 3.5c1.381 0 2.622.629 3.45 1.616L9.5 7h4V3l-1.4 1.4C11.1 3.3 9.65 2.5 8 2.5z"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="messages-content">
        <div class="messages-loading" style="display: none;">
          <div class="loading-spinner"></div>
          <span>Loading messages...</span>
        </div>
        <div class="messages-threads"></div>
        <div class="messages-empty" style="display: none;">
          <div class="empty-state-icon">💬</div>
          <p>No messages received</p>
          <p style="font-size: 0.875rem; margin-top: 0.5rem">
            Messages to developer will appear here
          </p>
        </div>
      </div>
    `;

    this.element = panel;
    this.threadsContainer = panel.querySelector(".messages-threads");
    this.filterElement = panel.querySelector(".messages-filter");

    this.attachEventListeners();
    this.loadInitialData();

    return panel;
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    // Filter change handlers
    const participantFilter = this.element.querySelector("#participant-filter");
    const priorityFilter = this.element.querySelector("#priority-filter");
    const refreshBtn = this.element.querySelector(".btn-refresh");

    participantFilter.addEventListener("change", (e) => {
      this.currentFilter.participant = e.target.value;
      this.applyFilters();
    });

    priorityFilter.addEventListener("change", (e) => {
      this.currentFilter.priority = e.target.value;
      this.applyFilters();
    });

    refreshBtn.addEventListener("click", () => {
      this.loadInitialData();
    });

    // Listen for real-time message events
    this.eventStream.on("message:sent", (message) => {
      this.handleNewMessage(message);
    });
  }

  /**
   * Load initial message data
   */
  async loadInitialData() {
    this.setLoading(true);

    try {
      // Load message threads
      const threadsData = await this.apiClient.getMessageThreads();

      // Create thread components (will filter for developer)
      this.renderThreads(threadsData.threads);

      // Update sender filter options based on rendered threads
      const senders = Array.from(this.threads.keys());
      this.updateParticipantFilter(senders);

      this.updateUI();
    } catch (error) {
      console.error("Failed to load messages:", error);
      this.showError("Failed to load messages");
    } finally {
      this.setLoading(false);
    }
  }

  /**
   * Update participant filter dropdown (now shows senders)
   */
  updateParticipantFilter(senders) {
    const participantFilter = this.element.querySelector("#participant-filter");

    // Clear existing options except "all"
    while (participantFilter.children.length > 1) {
      participantFilter.removeChild(participantFilter.lastChild);
    }

    // Add sender options
    senders.forEach((senderId) => {
      const option = document.createElement("option");
      option.value = senderId;
      option.textContent = senderId;
      participantFilter.appendChild(option);
    });
  }

  /**
   * Render message threads (only messages to developer)
   */
  renderThreads(threadsData) {
    // Clear existing threads
    this.threads.clear();
    this.threadsContainer.innerHTML = "";

    // Filter to only include messages addressed to "developer"
    const developerMessages = threadsData["developer"] || [];

    if (developerMessages.length === 0) {
      return; // No messages for developer
    }

    // Group developer messages by sender
    const messagesBySender = {};
    developerMessages.forEach((message) => {
      if (!messagesBySender[message.from]) {
        messagesBySender[message.from] = [];
      }
      messagesBySender[message.from].push(message);
    });

    // Sort threads by latest message timestamp (newest first)
    const sortedThreads = Object.entries(messagesBySender).sort(
      ([, messagesA], [, messagesB]) => {
        const latestA = Math.max(...messagesA.map((m) => m.timestamp));
        const latestB = Math.max(...messagesB.map((m) => m.timestamp));
        return latestB - latestA;
      },
    );

    // Create thread components
    sortedThreads.forEach(([senderId, messages]) => {
      const messageThread = new MessageThread(senderId, messages);
      const threadElement = messageThread.createElement();

      this.threadsContainer.appendChild(threadElement);
      this.threads.set(senderId, messageThread);
    });
  }

  /**
   * Handle new message from real-time events (only for developer)
   */
  handleNewMessage(message) {
    // Only show messages addressed to "developer"
    if (message.to !== "developer") {
      return;
    }

    const senderId = message.from;

    if (this.threads.has(senderId)) {
      // Add to existing thread
      this.threads.get(senderId).addMessage(message);

      // Move thread to top by reordering DOM elements
      const threadElement = this.threads.get(senderId).element;
      if (threadElement && threadElement.parentNode) {
        threadElement.parentNode.insertBefore(
          threadElement,
          threadElement.parentNode.firstChild,
        );
      }
    } else {
      // Create new thread and insert at top
      const messageThread = new MessageThread(senderId, [message]);
      const threadElement = messageThread.createElement();

      // Insert at the beginning (newest on top)
      if (this.threadsContainer.firstChild) {
        this.threadsContainer.insertBefore(
          threadElement,
          this.threadsContainer.firstChild,
        );
      } else {
        this.threadsContainer.appendChild(threadElement);
      }

      this.threads.set(senderId, messageThread);

      // Update participant filter
      const participantFilter = this.element.querySelector(
        "#participant-filter",
      );
      const option = document.createElement("option");
      option.value = senderId;
      option.textContent = senderId;
      participantFilter.appendChild(option);
    }

    this.updateUI();
  }

  /**
   * Apply current filters to threads
   */
  applyFilters() {
    this.threads.forEach((thread, senderId) => {
      const shouldShow =
        (this.currentFilter.participant === "all" ||
          senderId === this.currentFilter.participant) &&
        thread.matchesPriorityFilter(this.currentFilter.priority);

      thread.setVisible(shouldShow);
    });

    this.updateUI();
  }

  /**
   * Set loading state
   */
  setLoading(loading) {
    this.isLoading = loading;
    const loadingElement = this.element.querySelector(".messages-loading");
    const threadsElement = this.element.querySelector(".messages-threads");

    if (loading) {
      loadingElement.style.display = "flex";
      threadsElement.style.display = "none";
    } else {
      loadingElement.style.display = "none";
      threadsElement.style.display = "block";
    }
  }

  /**
   * Show error message
   */
  showError(message) {
    // Simple error display - could be enhanced with proper error UI
    console.error(message);
  }

  /**
   * Update UI based on current state
   */
  updateUI() {
    const hasVisibleThreads = Array.from(this.threads.values()).some((thread) =>
      thread.isVisible(),
    );
    const emptyElement = this.element.querySelector(".messages-empty");
    const threadsElement = this.element.querySelector(".messages-threads");

    if (!this.isLoading) {
      if (hasVisibleThreads) {
        emptyElement.style.display = "none";
        threadsElement.style.display = "block";
      } else {
        emptyElement.style.display = "flex";
        threadsElement.style.display = "none";
      }
    }
  }

  /**
   * Destroy the panel and clean up
   */
  destroy() {
    if (this.eventStream) {
      this.eventStream.off("message:sent", this.handleNewMessage);
    }

    this.threads.forEach((thread) => thread.destroy());
    this.threads.clear();

    if (this.element) {
      this.element.remove();
      this.element = null;
    }
  }
}
