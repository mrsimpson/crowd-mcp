/**
 * API Client for Crowd MCP Backend
 */
export class ApiClient {
  constructor(baseUrl = "") {
    this.baseUrl = baseUrl;
  }

  /**
   * Get all agents
   * @returns {Promise<Array>}
   */
  async getAgents() {
    const response = await fetch(`${this.baseUrl}/api/agents`);
    if (!response.ok) {
      throw new Error("Failed to fetch agents");
    }
    const data = await response.json();
    return data.agents;
  }

  /**
   * Get a specific agent
   * @param {string} id
   * @returns {Promise<Object>}
   */
  async getAgent(id) {
    const response = await fetch(`${this.baseUrl}/api/agents/${id}`);
    if (!response.ok) {
      throw new Error("Failed to fetch agent");
    }
    const data = await response.json();
    return data.agent;
  }

  /**
   * Stop an agent
   * @param {string} id
   * @returns {Promise<void>}
   */
  async stopAgent(id) {
    const response = await fetch(`${this.baseUrl}/api/agents/${id}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to stop agent");
    }
  }

  /**
   * Get static logs for an agent
   * @param {string} id
   * @param {number} tail - Number of lines to tail
   * @returns {Promise<string>}
   */
  async getAgentLogs(id, tail) {
    const url = new URL(
      `${this.baseUrl}/api/agents/${id}/logs`,
      window.location.origin,
    );
    if (tail) {
      url.searchParams.set("tail", tail.toString());
    }

    const response = await fetch(url);
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to fetch logs");
    }

    const data = await response.json();
    return data.logs;
  }

  /**
   * Create SSE connection for streaming logs
   * @param {string} id
   * @param {number} tail - Number of lines to start with
   * @returns {EventSource}
   */
  createLogStream(id, tail = 100) {
    const url = new URL(
      `${this.baseUrl}/api/agents/${id}/logs/stream`,
      window.location.origin,
    );
    if (tail) {
      url.searchParams.set("tail", tail.toString());
    }
    return new EventSource(url);
  }

  /**
   * Get all messages with optional filtering
   * @param {Object} options - Filter options
   * @returns {Promise<Object>}
   */
  async getMessages(options = {}) {
    const url = new URL(`${this.baseUrl}/api/messages`, window.location.origin);

    if (options.participant) {
      url.searchParams.set("participant", options.participant);
    }
    if (options.limit) {
      url.searchParams.set("limit", options.limit.toString());
    }
    if (options.since) {
      url.searchParams.set("since", options.since.toString());
    }

    const response = await fetch(url);
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to fetch messages");
    }

    return await response.json();
  }

  /**
   * Get message statistics
   * @returns {Promise<Object>}
   */
  async getMessageStats() {
    const response = await fetch(`${this.baseUrl}/api/messages/stats`);
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to fetch message stats");
    }

    return await response.json();
  }

  /**
   * Get message threads grouped by participants
   * @returns {Promise<Object>}
   */
  async getMessageThreads() {
    const response = await fetch(`${this.baseUrl}/api/messages/threads`);
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to fetch message threads");
    }

    return await response.json();
  }
}
