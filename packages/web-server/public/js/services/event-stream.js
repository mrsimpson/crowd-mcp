/**
 * Event Stream Manager for SSE connections
 */
export class EventStreamManager {
  constructor(url = "/api/events") {
    this.url = url;
    this.eventSource = null;
    this.listeners = new Map();
  }

  /**
   * Connect to the SSE endpoint
   */
  connect() {
    if (this.eventSource) {
      console.warn("EventSource already connected");
      return;
    }

    this.eventSource = new EventSource(this.url);

    // Listen for all registered event types
    this.listeners.forEach((callbacks, eventType) => {
      this.eventSource.addEventListener(eventType, (event) => {
        const data = JSON.parse(event.data);
        callbacks.forEach((callback) => callback(data));
      });
    });

    // Error handling
    this.eventSource.onerror = (error) => {
      console.error("SSE connection error:", error);
      this.notifyError(error);
    };
  }

  /**
   * Disconnect from the SSE endpoint
   */
  disconnect() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  /**
   * Register a listener for a specific event type
   * @param {string} eventType
   * @param {Function} callback
   */
  on(eventType, callback) {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, []);

      // If already connected, add the listener to the EventSource
      if (this.eventSource) {
        this.eventSource.addEventListener(eventType, (event) => {
          const data = JSON.parse(event.data);
          const callbacks = this.listeners.get(eventType) || [];
          callbacks.forEach((cb) => cb(data));
        });
      }
    }

    this.listeners.get(eventType).push(callback);
  }

  /**
   * Remove a listener
   * @param {string} eventType
   * @param {Function} callback
   */
  off(eventType, callback) {
    if (!this.listeners.has(eventType)) return;

    const callbacks = this.listeners.get(eventType);
    const index = callbacks.indexOf(callback);
    if (index > -1) {
      callbacks.splice(index, 1);
    }
  }

  /**
   * Notify error listeners
   * @param {Error} error
   */
  notifyError(error) {
    const errorCallbacks = this.listeners.get("error") || [];
    errorCallbacks.forEach((callback) => callback(error));
  }

  /**
   * Check if connected
   * @returns {boolean}
   */
  isConnected() {
    return (
      this.eventSource !== null &&
      this.eventSource.readyState === EventSource.OPEN
    );
  }
}
