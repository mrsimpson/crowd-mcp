import type { MessageRouter } from "../core/message-router-jsonl.js";
import type { AgentRegistry } from "@crowd-mcp/web-server";
import type { Agent, Message } from "@crowd-mcp/shared";
import { DEVELOPER_ID, BROADCAST_ID } from "@crowd-mcp/shared";
import { MessagingLogger } from "../logging/messaging-logger.js";

export interface SendMessageParams {
  from: string;
  to: string;
  content: string;
  priority?: "low" | "normal" | "high";
}

export interface SendMessageResult {
  success: boolean;
  messageId: string;
  from: string;
  to: string;
  timestamp: number;
  recipientCount?: number; // For broadcasts
}

export interface GetMessagesParams {
  participantId: string;
  unreadOnly?: boolean;
  limit?: number;
  since?: number;
  markAsRead?: boolean;
}

export interface GetMessagesResult {
  success: boolean;
  messages: Message[];
  count: number;
  unreadCount: number;
}

export interface DiscoverAgentsParams {
  status?: string;
  capability?: string;
}

export interface DiscoverAgentsResult {
  success: boolean;
  agents: Agent[];
  count: number;
}

export interface MarkMessagesReadParams {
  messageIds: string[];
}

export interface MarkMessagesReadResult {
  success: boolean;
  markedCount: number;
}

/**
 * MessagingTools provides MCP tools for agent-to-agent and agent-to-developer communication
 */
export class MessagingTools {
  private logger?: MessagingLogger;

  constructor(
    private messageRouter: MessageRouter,
    private agentRegistry: AgentRegistry,
    logger?: MessagingLogger,
  ) {
    this.logger = logger;
  }

  /**
   * Send a message to another participant or broadcast
   *
   * Supports:
   * - Agent → Agent
   * - Agent → Developer
   * - Developer → Agent
   * - Any → Broadcast
   */
  async sendMessage(params: SendMessageParams): Promise<SendMessageResult> {
    const { from, to, content, priority = "normal" } = params;

    // Validate sender exists
    if (from !== DEVELOPER_ID) {
      const senderAgent = this.agentRegistry.getAgent(from);
      if (!senderAgent) {
        throw new Error(`Sender ${from} not found`);
      }
    }

    // Validate recipient exists (unless broadcast)
    if (to !== BROADCAST_ID && to !== DEVELOPER_ID) {
      const recipientAgent = this.agentRegistry.getAgent(to);
      if (!recipientAgent) {
        throw new Error(`Recipient ${to} not found`);
      }
    }

    // Send message
    const message = await this.messageRouter.send({
      from,
      to,
      content,
      priority,
    });

    const result: SendMessageResult = {
      success: true,
      messageId: message.id,
      from: message.from,
      to: message.to,
      timestamp: message.timestamp,
    };

    // For broadcasts, count recipients
    if (to === BROADCAST_ID) {
      const participants = this.messageRouter.getRegisteredParticipants();
      result.recipientCount = participants.filter((p) => p !== from).length;
    }

    return result;
  }

  /**
   * Get messages for a participant
   */
  async getMessages(params: GetMessagesParams): Promise<GetMessagesResult> {
    const { participantId, unreadOnly, limit, since, markAsRead } = params;

    // Validate participant exists
    if (participantId !== DEVELOPER_ID) {
      const agent = this.agentRegistry.getAgent(participantId);
      if (!agent) {
        throw new Error(`Participant ${participantId} not found`);
      }
    }

    // Get messages
    const messages = await this.messageRouter.getMessages(participantId, {
      unreadOnly,
      limit,
      since,
    });

    // Count unread messages
    const allMessages = await this.messageRouter.getMessages(participantId);
    const unreadCount = allMessages.filter((m) => !m.read).length;

    // Mark as read if requested
    if (markAsRead && messages.length > 0) {
      const messageIds = messages.map((m) => m.id);
      await this.messageRouter.markAsRead(messageIds);
    }

    return {
      success: true,
      messages,
      count: messages.length,
      unreadCount,
    };
  }

  /**
   * Discover all active agents (excludes developer)
   */
  async discoverAgents(
    params: DiscoverAgentsParams,
  ): Promise<DiscoverAgentsResult> {
    let agents = this.agentRegistry.listAgents();

    // Filter by status if provided
    if (params.status && agents.length > 0) {
      agents = agents.filter((a) => a.status === params.status);
    }

    // Filter by capability if provided
    if (params.capability && agents.length > 0) {
      agents = agents.filter(
        (a) => a.capabilities && a.capabilities.includes(params.capability!),
      );
    }

    return {
      success: true,
      agents,
      count: agents.length,
    };
  }

  /**
   * Mark messages as read
   */
  async markMessagesRead(
    params: MarkMessagesReadParams,
  ): Promise<MarkMessagesReadResult> {
    const { messageIds } = params;

    if (messageIds.length === 0) {
      return {
        success: true,
        markedCount: 0,
      };
    }

    await this.messageRouter.markAsRead(messageIds);

    return {
      success: true,
      markedCount: messageIds.length,
    };
  }

  /**
   * Get MCP tool definitions for Management Interface (Developer)
   */
  getManagementToolDefinitions() {
    return [
      {
        name: "send_message",
        description:
          "Send a message to an agent or broadcast to all agents. Use this to communicate with your autonomous agents.",
        inputSchema: {
          type: "object",
          properties: {
            to: {
              type: "string",
              description:
                'Recipient: agent ID (e.g., "agent-123"), or "broadcast" to send to all agents',
            },
            content: {
              type: "string",
              description: "The message content",
            },
            priority: {
              type: "string",
              enum: ["low", "normal", "high"],
              description: "Message priority (default: normal)",
            },
          },
          required: ["to", "content"],
        },
      },
      {
        name: "get_messages",
        description:
          "Retrieve messages sent to you by agents. Agents can send you questions, status updates, or request assistance.",
        inputSchema: {
          type: "object",
          properties: {
            unreadOnly: {
              type: "boolean",
              description: "Only show unread messages (default: false)",
            },
            limit: {
              type: "number",
              description: "Maximum number of messages to retrieve",
            },
            markAsRead: {
              type: "boolean",
              description: "Mark retrieved messages as read (default: false)",
            },
          },
        },
      },
      {
        name: "mark_messages_read",
        description: "Mark specific messages as read",
        inputSchema: {
          type: "object",
          properties: {
            messageIds: {
              type: "array",
              items: { type: "string" },
              description: "Array of message IDs to mark as read",
            },
          },
          required: ["messageIds"],
        },
      },
      {
        name: "git_clone_repository",
        description:
          "Clone a Git repository into an agent's workspace. The agent must be running to perform Git operations.",
        inputSchema: {
          type: "object",
          properties: {
            repositoryUrl: {
              type: "string",
              description: "The Git repository URL (HTTPS or SSH)",
            },
            targetPath: {
              type: "string",
              description: "Target directory path within the agent's workspace",
            },
            branch: {
              type: "string",
              description: "Branch to checkout (default: main)",
            },
            agentId: {
              type: "string",
              description:
                "ID of the agent that should perform the clone operation",
            },
          },
          required: ["repositoryUrl", "targetPath", "agentId"],
        },
      },
    ];
  }

  /**
   * Get MCP tool definitions for Agent Interface
   */
  getAgentToolDefinitions() {
    return [
      {
        name: "send_message",
        description:
          "Send a message to another agent, the developer, or broadcast to everyone. Use this to ask questions, share information, or request help.",
        inputSchema: {
          type: "object",
          properties: {
            to: {
              type: "string",
              description:
                'Recipient: agent ID, "developer", or "broadcast" for everyone',
            },
            content: {
              type: "string",
              description: "The message content",
            },
            priority: {
              type: "string",
              enum: ["low", "normal", "high"],
              description: "Message priority (default: normal)",
            },
          },
          required: ["to", "content"],
        },
      },
      {
        name: "get_my_messages",
        description:
          "Retrieve messages sent to you by other agents or the developer. Check for questions, instructions, or information.",
        inputSchema: {
          type: "object",
          properties: {
            unreadOnly: {
              type: "boolean",
              description: "Only show unread messages (default: false)",
            },
            limit: {
              type: "number",
              description: "Maximum number of messages to retrieve",
            },
            markAsRead: {
              type: "boolean",
              description: "Mark retrieved messages as read (default: true)",
            },
          },
        },
      },
      {
        name: "discover_agents",
        description:
          "Find other active agents. Use this to see who else is working and what they are doing.",
        inputSchema: {
          type: "object",
          properties: {
            status: {
              type: "string",
              description: 'Filter by status (e.g., "idle", "working")',
            },
            capability: {
              type: "string",
              description: 'Filter by capability (e.g., "react", "python")',
            },
          },
        },
      },
      {
        name: "mark_messages_read",
        description: "Mark specific messages as read",
        inputSchema: {
          type: "object",
          properties: {
            messageIds: {
              type: "array",
              items: { type: "string" },
              description: "Array of message IDs to mark as read",
            },
          },
          required: ["messageIds"],
        },
      },
    ];
  }
}
