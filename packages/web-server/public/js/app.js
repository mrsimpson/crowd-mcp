import { ApiClient } from "./services/api.js";
import { EventStreamManager } from "./services/event-stream.js";
import { AgentCard } from "./components/agent-card.js";

/**
 * Main Application
 */
class App {
  constructor() {
    this.apiClient = new ApiClient();
    this.eventStream = new EventStreamManager();
    this.agents = new Map(); // agentId -> AgentCard
    this.agentsContainer = null;
    this.emptyState = null;
    this.statusIndicator = null;
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

    // Set up event stream listeners
    this.setupEventListeners();

    // Connect to event stream
    this.eventStream.connect();
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

    // Connection error
    this.eventStream.on("error", (error) => {
      console.error("Event stream error:", error);
      if (this.statusIndicator) {
        this.statusIndicator.style.background = "#ef4444";
      }
    });
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
      this.updateUI();
    });

    const cardElement = agentCard.createElement();
    this.agentsContainer.appendChild(cardElement);

    this.agents.set(agent.id, agentCard);

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
