import { ApiClient } from "./services/api.js";
import { EventStreamManager } from "./services/event-stream.js";
import { AgentCard } from "./components/agent-card.js";
import { MessagesPanel } from "./components/messages-panel.js";

/**
 * Main Application
 */
class App {
  constructor() {
    this.apiClient = new ApiClient();
    this.eventStream = new EventStreamManager();
    this.agents = new Map(); // agentId -> AgentCard
    this.agentMessages = new Map(); // agentId -> messages[]
    this.agentsContainer = null;
    this.emptyState = null;
    this.statusIndicator = null;
    this.messagesPanel = null;
  }

  /**
   * Initialize the application
   */
  async init() {
    // Get DOM elements
    this.agentsContainer = document.getElementById("agents-container");
    this.emptyState = document.getElementById("empty-state");
    this.statusIndicator = document.querySelector(".status-indicator");

    if (!this.agentsContainer || !this.emptyState) {
      console.error("Required DOM elements not found");
      return;
    }

    // Initialize messages panel
    this.initializeMessagesPanel();

    // Set up event stream listeners
    this.setupEventListeners();

    // Load initial messages
    await this.loadMessages();

    // Connect to event stream
    this.eventStream.connect();
  }

  /**
   * Initialize the messages panel
   */
  initializeMessagesPanel() {
    this.messagesPanel = new MessagesPanel(this.apiClient, this.eventStream);
    const messagesPanelElement = this.messagesPanel.createElement();

    // Find the main element and add messages panel after agents container
    const main = document.querySelector("main");
    if (main) {
      main.appendChild(messagesPanelElement);
    }
  }

  /**
   * Set up event stream listeners
   */
  setupEventListeners() {
    // Initial agents list
    this.eventStream.on("init", (data) => {
      data.agents.forEach((agent) => this.handleAgentCreated(agent));
      this.updateUI();
    });

    // Agent created
    this.eventStream.on("agent:created", (agent) => {
      this.handleAgentCreated(agent);
      this.updateUI();
    });

    // Agent updated
    this.eventStream.on("agent:updated", (agent) => {
      this.handleAgentUpdated(agent);
    });

    // Agent removed
    this.eventStream.on("agent:removed", (agent) => {
      this.handleAgentRemoved(agent);
      this.updateUI();
    });

    // New message sent
    this.eventStream.on("message:sent", (message) => {
      this.handleNewMessage(message);
    });

    // Connection error
    this.eventStream.on("error", (error) => {
      console.error("Event stream error:", error);
      if (this.statusIndicator) {
        this.statusIndicator.style.background = "#ef4444";
      }
    });
  }

  /**
   * Load messages and organize by agent (only received messages)
   */
  async loadMessages() {
    try {
      const threadsData = await this.apiClient.getMessageThreads();

      // Clear existing messages
      this.agentMessages.clear();

      // Process each thread and organize messages by recipient agent
      Object.entries(threadsData.threads).forEach(([participantId, messages]) => {
        messages.forEach((message) => {
          // Add message to the recipient agent only
          if (!this.agentMessages.has(message.to)) {
            this.agentMessages.set(message.to, []);
          }
          this.agentMessages.get(message.to).push(message);
        });
      });

      // Update existing agent cards with messages
      this.agents.forEach((agentCard, agentId) => {
        const agentMsgs = this.agentMessages.get(agentId) || [];
        agentCard.setMessages(agentMsgs);
      });
    } catch (error) {
      console.error("Failed to load messages:", error);
    }
  }

  /**
   * Handle new message event (only add to recipient agent)
   * @param {Object} message
   */
  handleNewMessage(message) {
    // Add to recipient agent only
    if (!this.agentMessages.has(message.to)) {
      this.agentMessages.set(message.to, []);
    }
    this.agentMessages.get(message.to).push(message);

    const toAgent = this.agents.get(message.to);
    if (toAgent) {
      toAgent.addMessage(message);
    }
  }

  /**
   * Handle agent created event
   * @param {Object} agent
   */
  handleAgentCreated(agent) {
    if (this.agents.has(agent.id)) {
      console.warn(`Agent ${agent.id} already exists`);
      return;
    }

    const agentCard = new AgentCard(agent, this.apiClient, (id) => {
      this.agents.delete(id);
      this.agentMessages.delete(id);
      this.updateUI();
    });

    const cardElement = agentCard.createElement();
    this.agentsContainer.appendChild(cardElement);

    this.agents.set(agent.id, agentCard);

    // Set messages for the agent if they exist
    const agentMsgs = this.agentMessages.get(agent.id) || [];
    agentCard.setMessages(agentMsgs);

    // Add animation
    cardElement.classList.add("new");
  }

  /**
   * Handle agent updated event
   * @param {Object} agent
   */
  handleAgentUpdated(agent) {
    const agentCard = this.agents.get(agent.id);
    if (agentCard) {
      agentCard.update(agent);
    }
  }

  /**
   * Handle agent removed event
   * @param {Object} agent
   */
  handleAgentRemoved(agent) {
    const agentCard = this.agents.get(agent.id);
    if (agentCard) {
      agentCard.remove();
      // Note: The card will call onRemove callback which deletes from map
    }
  }

  /**
   * Update UI based on agent count
   */
  updateUI() {
    if (this.agents.size === 0) {
      this.agentsContainer.style.display = "none";
      this.emptyState.style.display = "block";
    } else {
      this.agentsContainer.style.display = "grid";
      this.emptyState.style.display = "none";
    }
  }
}

// Initialize app when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    const app = new App();
    app.init();
  });
} else {
  const app = new App();
  app.init();
}
