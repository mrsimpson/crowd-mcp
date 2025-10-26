import { promises as fs } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import type { Message } from '@crowd-mcp/shared';
import { BROADCAST_ID } from '@crowd-mcp/shared';

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

export interface MessageRouterConfig {
  sessionId?: string;
  baseDir?: string;
}

/**
 * MessageRouter with JSONL file-based storage
 *
 * Each server session creates its own directory:
 * - .crowd/sessions/{sessionId}/messages.jsonl
 * - .crowd/sessions/{sessionId}/session.json
 *
 * Supports messaging between:
 * - Agent ↔ Agent
 * - Agent ↔ Developer
 * - Broadcast (to all participants)
 */
export class MessageRouter {
  private sessionId: string;
  private sessionDir: string;
  private messagesFile: string;
  private sessionFile: string;
  private initialized = false;
  private participants: Set<string> = new Set();
  private messageCache: Map<string, Message> = new Map();

  constructor(config: MessageRouterConfig = {}) {
    this.sessionId = config.sessionId || Date.now().toString();
    const baseDir = config.baseDir || './.crowd/sessions';
    this.sessionDir = join(baseDir, this.sessionId);
    this.messagesFile = join(this.sessionDir, 'messages.jsonl');
    this.sessionFile = join(this.sessionDir, 'session.json');
  }

  /**
   * Initialize session directory and load existing messages
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Create session directory
    await fs.mkdir(this.sessionDir, { recursive: true });

    // Create or update session metadata
    const sessionMeta = {
      sessionId: this.sessionId,
      startTime: Date.now(),
      version: '1.0.0',
    };
    await fs.writeFile(this.sessionFile, JSON.stringify(sessionMeta, null, 2));

    // Load existing messages into cache (if file exists)
    try {
      const content = await fs.readFile(this.messagesFile, 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);
      for (const line of lines) {
        const message = JSON.parse(line) as Message;
        this.messageCache.set(message.id, message);
      }
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
      // File doesn't exist yet - that's fine
    }

    this.initialized = true;
    console.error(`MessageRouter initialized: ${this.sessionDir}`);
  }

  /**
   * Send a message between participants
   *
   * Handles:
   * - Direct messages (agent-to-agent, agent-to-developer, developer-to-agent)
   * - Broadcast messages (to='broadcast')
   */
  async send(options: SendMessageOptions): Promise<Message> {
    await this.ensureInitialized();

    // Validate participants
    if (!this.participants.has(options.from)) {
      throw new Error(`Sender "${options.from}" is not registered as a participant`);
    }

    if (options.to !== BROADCAST_ID && !this.participants.has(options.to)) {
      throw new Error(`Recipient "${options.to}" is not registered as a participant`);
    }

    // Handle broadcast
    if (options.to === BROADCAST_ID) {
      return await this.broadcastMessage(options);
    }

    // Create direct message
    const message: Message = {
      id: randomUUID(),
      from: options.from,
      to: options.to,
      content: options.content,
      timestamp: Date.now(),
      read: false,
      priority: options.priority || 'normal',
    };

    // Store message
    await this.storeMessage(message);

    return message;
  }

  /**
   * Broadcast message to all participants except sender
   */
  private async broadcastMessage(options: SendMessageOptions): Promise<Message> {
    const recipients = Array.from(this.participants).filter(
      (p) => p !== options.from
    );

    if (recipients.length === 0) {
      throw new Error('No recipients for broadcast (only sender is registered)');
    }

    // Create a message for each recipient
    const baseId = randomUUID();
    const timestamp = Date.now();

    for (let i = 0; i < recipients.length; i++) {
      const message: Message = {
        id: `${baseId}-${i}`,
        from: options.from,
        to: recipients[i],
        content: options.content,
        timestamp,
        read: false,
        priority: options.priority || 'normal',
      };

      await this.storeMessage(message);
    }

    // Return a representative message
    return {
      id: baseId,
      from: options.from,
      to: BROADCAST_ID,
      content: options.content,
      timestamp,
      read: false,
      priority: options.priority || 'normal',
    };
  }

  /**
   * Store a message to JSONL file and cache
   */
  private async storeMessage(message: Message): Promise<void> {
    // Add to cache
    this.messageCache.set(message.id, message);

    // Append to JSONL file
    const line = JSON.stringify(message) + '\n';
    await fs.appendFile(this.messagesFile, line, 'utf-8');
  }

  /**
   * Get messages for a participant
   */
  async getMessages(
    participantId: string,
    options: GetMessagesOptions = {}
  ): Promise<Message[]> {
    await this.ensureInitialized();

    // Get all messages for this participant
    let messages = Array.from(this.messageCache.values()).filter(
      (m) => m.to === participantId
    );

    // Filter by unread status
    if (options.unreadOnly) {
      messages = messages.filter((m) => !m.read);
    }

    // Filter by timestamp
    if (options.since !== undefined) {
      messages = messages.filter((m) => m.timestamp >= options.since!);
    }

    // Sort by priority and timestamp
    this.sortMessages(messages);

    // Limit results
    if (options.limit && options.limit > 0) {
      messages = messages.slice(0, options.limit);
    }

    return messages;
  }

  /**
   * Mark messages as read
   */
  async markAsRead(messageIds: string[]): Promise<void> {
    await this.ensureInitialized();

    // Update cache
    for (const id of messageIds) {
      const message = this.messageCache.get(id);
      if (message) {
        message.read = true;
      }
    }

    // Rewrite entire JSONL file with updated read status
    await this.rewriteMessagesFile();
  }

  /**
   * Rewrite messages file (used after marking as read)
   */
  private async rewriteMessagesFile(): Promise<void> {
    const lines = Array.from(this.messageCache.values())
      .map((m) => JSON.stringify(m))
      .join('\n');

    if (lines) {
      await fs.writeFile(this.messagesFile, lines + '\n', 'utf-8');
    }
  }

  /**
   * Get message statistics for a participant
   */
  async getMessageStats(participantId: string): Promise<{
    total: number;
    unread: number;
    byPriority: { high: number; normal: number; low: number };
  }> {
    await this.ensureInitialized();

    const messages = Array.from(this.messageCache.values()).filter(
      (m) => m.to === participantId
    );

    const unread = messages.filter((m) => !m.read).length;

    const byPriority = {
      high: messages.filter((m) => m.priority === 'high').length,
      normal: messages.filter((m) => m.priority === 'normal').length,
      low: messages.filter((m) => m.priority === 'low').length,
    };

    return {
      total: messages.length,
      unread,
      byPriority,
    };
  }

  /**
   * Clear all messages for a participant
   */
  async clearMessages(participantId: string): Promise<void> {
    await this.ensureInitialized();

    // Remove from cache
    for (const [id, message] of this.messageCache.entries()) {
      if (message.to === participantId) {
        this.messageCache.delete(id);
      }
    }

    // Rewrite file
    await this.rewriteMessagesFile();
  }

  /**
   * Register a participant in the messaging system
   */
  registerParticipant(participantId: string): void {
    this.participants.add(participantId);
  }

  /**
   * Unregister a participant
   */
  unregisterParticipant(participantId: string): void {
    this.participants.delete(participantId);
  }

  /**
   * Get list of registered participants
   */
  getRegisteredParticipants(): string[] {
    return Array.from(this.participants);
  }

  /**
   * Get session information
   */
  getSessionInfo(): { sessionId: string; sessionDir: string } {
    return {
      sessionId: this.sessionId,
      sessionDir: this.sessionDir,
    };
  }

  /**
   * Get overall message statistics
   */
  async getStats(): Promise<{
    totalMessages: number;
    unreadMessages: number;
    totalParticipants: number;
  }> {
    await this.ensureInitialized();

    const totalMessages = this.messageCache.size;
    const unreadMessages = Array.from(this.messageCache.values()).filter(
      (m) => !m.read
    ).length;

    return {
      totalMessages,
      unreadMessages,
      totalParticipants: this.participants.size,
    };
  }

  /**
   * Close the message router
   */
  async close(): Promise<void> {
    // Nothing to close for file-based storage
    this.initialized = false;
  }

  /**
   * Ensure router is initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * Sort messages by priority and timestamp
   * Priority order: high > normal > low
   */
  private sortMessages(messages: Message[]): void {
    const priorityOrder: Record<'low' | 'normal' | 'high', number> = {
      high: 3,
      normal: 2,
      low: 1,
    };

    messages.sort((a, b) => {
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
