#!/usr/bin/env node

/**
 * Message Listener Wrapper for OpenCode Agents
 *
 * This wrapper:
 * - Connects to the message server via SSE
 * - Listens for messages addressed to this agent
 * - Spawns OpenCode as a subprocess
 * - Injects messages into OpenCode's stdin (simulating user input)
 * - Handles reconnection with exponential backoff
 * - Acknowledges message delivery
 */

import { spawn } from "child_process";
import { EventEmitter } from "events";

class MessageListener extends EventEmitter {
  constructor(config) {
    super();

    this.agentId = config.agentId;
    this.messageServerUrl = config.messageServerUrl;
    this.opencodePath = config.opencodePath;
    this.opencodeArgs = config.opencodeArgs || [];

    // Reconnection settings
    this.maxReconnectAttempts = config.maxReconnectAttempts || 10;
    this.initialRetryDelay = config.initialRetryDelay || 1000;
    this.maxRetryDelay = config.maxRetryDelay || 30000;
    this.currentRetryDelay = this.initialRetryDelay;
    this.reconnectAttempts = 0;

    // State
    this.opencode = null;
    this.eventSource = null;
    this.isShuttingDown = false;
    this.processedMessageIds = new Set();
  }

  /**
   * Start the message listener and OpenCode subprocess
   */
  async start() {
    console.log(`[MessageListener] Starting for agent: ${this.agentId}`);

    // Spawn OpenCode subprocess
    await this.spawnOpenCode();

    // Connect to message server
    await this.connectToMessageServer();

    // Handle graceful shutdown
    process.on("SIGTERM", () => this.shutdown());
    process.on("SIGINT", () => this.shutdown());
  }

  /**
   * Spawn OpenCode as a subprocess
   */
  async spawnOpenCode() {
    console.log(
      `[MessageListener] Spawning OpenCode: ${this.opencodePath} ${this.opencodeArgs.join(" ")}`,
    );

    this.opencode = spawn(this.opencodePath, this.opencodeArgs, {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    });

    // Forward stdout/stderr to parent process
    this.opencode.stdout.on("data", (data) => {
      process.stdout.write(data);
    });

    this.opencode.stderr.on("data", (data) => {
      process.stderr.write(data);
    });

    // Handle OpenCode exit
    this.opencode.on("exit", (code, signal) => {
      console.error(
        `[MessageListener] OpenCode exited with code ${code}, signal ${signal}`,
      );

      if (!this.isShuttingDown) {
        console.error(
          "[MessageListener] OpenCode crashed unexpectedly, restarting...",
        );
        setTimeout(() => this.spawnOpenCode(), 2000);
      }
    });

    this.opencode.on("error", (error) => {
      console.error("[MessageListener] Failed to spawn OpenCode:", error);
      process.exit(1);
    });

    console.log("[MessageListener] OpenCode spawned successfully");
  }

  /**
   * Connect to message server SSE endpoint
   */
  async connectToMessageServer() {
    const eventsUrl = `${this.messageServerUrl}/api/events`;
    console.log(`[MessageListener] Connecting to message server: ${eventsUrl}`);

    try {
      // Use dynamic import for eventsource since it's ESM
      const EventSource = (await import("eventsource")).default;

      this.eventSource = new EventSource(eventsUrl);

      this.eventSource.onopen = () => {
        console.log("[MessageListener] Connected to message server");
        this.reconnectAttempts = 0;
        this.currentRetryDelay = this.initialRetryDelay;
      };

      this.eventSource.addEventListener("message:sent", (event) => {
        this.handleMessageEvent(event);
      });

      this.eventSource.onerror = (error) => {
        console.error("[MessageListener] SSE connection error:", error);
        this.handleConnectionError();
      };
    } catch (error) {
      console.error("[MessageListener] Failed to create EventSource:", error);
      this.handleConnectionError();
    }
  }

  /**
   * Handle incoming message event from SSE
   */
  handleMessageEvent(event) {
    try {
      const message = JSON.parse(event.data);

      // Check if message is for this agent
      if (message.to !== this.agentId && message.to !== "broadcast") {
        return; // Not for us
      }

      // Check if we've already processed this message (deduplication)
      if (this.processedMessageIds.has(message.id)) {
        console.log(
          `[MessageListener] Skipping duplicate message: ${message.id}`,
        );
        return;
      }

      console.log(
        `[MessageListener] Received message from ${message.from}: ${message.content.substring(0, 100)}...`,
      );

      // Mark as processed
      this.processedMessageIds.add(message.id);

      // Inject message into OpenCode's stdin
      this.injectMessage(message);

      // Acknowledge delivery
      this.acknowledgeMessage(message.id);
    } catch (error) {
      console.error("[MessageListener] Failed to parse message event:", error);
    }
  }

  /**
   * Inject message into OpenCode's stdin
   */
  injectMessage(message) {
    if (!this.opencode || !this.opencode.stdin.writable) {
      console.error(
        "[MessageListener] OpenCode stdin not writable, cannot inject message",
      );
      return;
    }

    // Format message for OpenCode
    // Include metadata about the sender and priority
    let formattedMessage = "";

    if (message.priority === "high") {
      formattedMessage += "[URGENT] ";
    }

    if (message.from !== "developer") {
      formattedMessage += `Message from ${message.from}: `;
    }

    formattedMessage += message.content;

    console.log(`[MessageListener] Injecting message into OpenCode stdin`);

    try {
      this.opencode.stdin.write(formattedMessage + "\n");
    } catch (error) {
      console.error(
        "[MessageListener] Failed to write to OpenCode stdin:",
        error,
      );
    }
  }

  /**
   * Send acknowledgment to message server
   */
  async acknowledgeMessage(messageId) {
    // Mark message as read via the API
    const url = `${this.messageServerUrl}/api/messages/acknowledge`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          agentId: this.agentId,
          messageId: messageId,
        }),
      });

      if (response.ok) {
        console.log(`[MessageListener] Acknowledged message: ${messageId}`);
      } else {
        console.error(
          `[MessageListener] Failed to acknowledge message: ${response.status}`,
        );
      }
    } catch (error) {
      // Non-fatal error - message was still delivered to OpenCode
      console.error("[MessageListener] Failed to send acknowledgment:", error);
    }
  }

  /**
   * Handle connection errors with exponential backoff
   */
  handleConnectionError() {
    if (this.isShuttingDown) {
      return;
    }

    this.reconnectAttempts++;

    if (this.reconnectAttempts > this.maxReconnectAttempts) {
      console.error(
        `[MessageListener] Max reconnection attempts (${this.maxReconnectAttempts}) exceeded`,
      );
      this.shutdown();
      return;
    }

    console.log(
      `[MessageListener] Reconnecting in ${this.currentRetryDelay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`,
    );

    setTimeout(() => {
      this.connectToMessageServer();
    }, this.currentRetryDelay);

    // Exponential backoff
    this.currentRetryDelay = Math.min(
      this.currentRetryDelay * 2,
      this.maxRetryDelay,
    );
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    if (this.isShuttingDown) {
      return;
    }

    console.log("[MessageListener] Shutting down...");
    this.isShuttingDown = true;

    // Close SSE connection
    if (this.eventSource) {
      this.eventSource.close();
    }

    // Terminate OpenCode subprocess
    if (this.opencode) {
      this.opencode.kill("SIGTERM");

      // Force kill after 5 seconds
      setTimeout(() => {
        if (this.opencode && !this.opencode.killed) {
          console.log("[MessageListener] Force killing OpenCode...");
          this.opencode.kill("SIGKILL");
        }
      }, 5000);
    }

    process.exit(0);
  }
}

// Main entry point
async function main() {
  // Read configuration from environment variables
  const agentId = process.env.AGENT_ID;
  const messageServerUrl =
    process.env.MESSAGE_SERVER_URL || "http://host.docker.internal:3000";
  const opencodePath = process.env.OPENCODE_PATH || "/usr/local/bin/opencode";
  const agentType = process.env.AGENT_TYPE;

  if (!agentId) {
    console.error(
      "[MessageListener] AGENT_ID environment variable is required",
    );
    process.exit(1);
  }

  // Build OpenCode arguments
  const opencodeArgs = [];

  if (agentType) {
    opencodeArgs.push("--agent", agentType);
  }

  // Create and start message listener
  const listener = new MessageListener({
    agentId,
    messageServerUrl,
    opencodePath,
    opencodeArgs,
  });

  await listener.start();
}

main().catch((error) => {
  console.error("[MessageListener] Fatal error:", error);
  process.exit(1);
});
