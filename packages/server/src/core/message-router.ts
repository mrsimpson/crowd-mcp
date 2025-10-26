import type { Message } from '@crowd-mcp/shared';

export interface SendMessageOptions {
  from: string;
  to: string;
  content: string;
  priority?: 'low' | 'normal' | 'high';
}

export interface GetMessagesOptions {
  unreadOnly?: boolean;
  limit?: number;
  since?: number;
}

export class MessageRouter {
  // Map: agentId -> Message[]
  private messageQueues: Map<string, Message[]> = new Map();

  /**
   * Send a direct message from one agent to another
   */
  async send(options: SendMessageOptions): Promise<Message> {
    const message: Message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      from: options.from,
      to: options.to,
      content: options.content,
      timestamp: Date.now(),
      read: false,
      priority: options.priority || 'normal',
    };

    // Get or create message queue for recipient
    let queue = this.messageQueues.get(options.to);
    if (!queue) {
      queue = [];
      this.messageQueues.set(options.to, queue);
    }

    // Add message to recipient's queue (sorted by priority and timestamp)
    queue.push(message);
    this.sortQueue(queue);

    return message;
  }

  /**
   * Broadcast a message from one agent to all other agents
   */
  async broadcast(from: string, content: string): Promise<string[]> {
    const recipientIds: string[] = [];

    // Send to all agents except the sender
    for (const agentId of this.messageQueues.keys()) {
      if (agentId !== from) {
        await this.send({
          from,
          to: agentId,
          content,
          priority: 'normal',
        });
        recipientIds.push(agentId);
      }
    }

    return recipientIds;
  }

  /**
   * Get messages for a specific agent
   */
  getMessages(agentId: string, options: GetMessagesOptions = {}): Message[] {
    const queue = this.messageQueues.get(agentId);
    if (!queue) {
      return [];
    }

    let messages = [...queue];

    // Filter by unread status
    if (options.unreadOnly) {
      messages = messages.filter((m) => !m.read);
    }

    // Filter by timestamp
    if (options.since) {
      messages = messages.filter((m) => m.timestamp >= options.since);
    }

    // Limit results
    if (options.limit && options.limit > 0) {
      messages = messages.slice(0, options.limit);
    }

    return messages;
  }

  /**
   * Mark a message as read
   */
  markRead(messageId: string): boolean {
    for (const queue of this.messageQueues.values()) {
      const message = queue.find((m) => m.id === messageId);
      if (message) {
        message.read = true;
        return true;
      }
    }
    return false;
  }

  /**
   * Mark multiple messages as read
   */
  markMultipleRead(messageIds: string[]): number {
    let count = 0;
    for (const id of messageIds) {
      if (this.markRead(id)) {
        count++;
      }
    }
    return count;
  }

  /**
   * Register an agent (create its message queue)
   */
  registerAgent(agentId: string): void {
    if (!this.messageQueues.has(agentId)) {
      this.messageQueues.set(agentId, []);
    }
  }

  /**
   * Unregister an agent (remove its message queue)
   */
  unregisterAgent(agentId: string): void {
    this.messageQueues.delete(agentId);
  }

  /**
   * Get all registered agent IDs
   */
  getRegisteredAgents(): string[] {
    return Array.from(this.messageQueues.keys());
  }

  /**
   * Clear all messages for an agent
   */
  clearMessages(agentId: string): void {
    const queue = this.messageQueues.get(agentId);
    if (queue) {
      queue.length = 0;
    }
  }

  /**
   * Get statistics about the message router
   */
  getStats(): {
    totalAgents: number;
    totalMessages: number;
    unreadMessages: number;
  } {
    let totalMessages = 0;
    let unreadMessages = 0;

    for (const queue of this.messageQueues.values()) {
      totalMessages += queue.length;
      unreadMessages += queue.filter((m) => !m.read).length;
    }

    return {
      totalAgents: this.messageQueues.size,
      totalMessages,
      unreadMessages,
    };
  }

  /**
   * Sort a message queue by priority and timestamp
   * Priority order: high > normal > low
   */
  private sortQueue(queue: Message[]): void {
    const priorityOrder = { high: 3, normal: 2, low: 1 };

    queue.sort((a, b) => {
      // First sort by priority (high to low)
      const priorityDiff =
        priorityOrder[b.priority] - priorityOrder[a.priority];
      if (priorityDiff !== 0) {
        return priorityDiff;
      }

      // Then sort by timestamp (oldest first)
      return a.timestamp - b.timestamp;
    });
  }
}
