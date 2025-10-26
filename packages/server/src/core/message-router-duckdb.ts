import { Database, Connection } from 'duckdb';
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import type { Message, BROADCAST_ID, DEVELOPER_ID } from '@crowd-mcp/shared';

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
  dbPath?: string;
  parquetExportInterval?: number; // milliseconds
}

/**
 * MessageRouter with persistent DuckDB storage and Parquet export
 *
 * Supports messaging between:
 * - Agent ↔ Agent
 * - Agent ↔ Developer
 * - Broadcast (to all participants)
 */
export class MessageRouter {
  private db!: Database;
  private conn!: Connection;
  private dbPath: string;
  private parquetPath: string;
  private exportInterval: number;
  private exportTimer?: NodeJS.Timeout;
  private initialized = false;
  private participants: Set<string> = new Set();

  constructor(config: MessageRouterConfig = {}) {
    this.dbPath = config.dbPath || './.crowd/db/messages.db';
    this.parquetPath = join(dirname(this.dbPath), 'messages.parquet');
    this.exportInterval = config.parquetExportInterval || 3600000; // 1 hour
  }

  /**
   * Initialize database connection and schema
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Ensure directory exists
    await fs.mkdir(dirname(this.dbPath), { recursive: true });

    // Create database connection
    this.db = new Database(this.dbPath);
    this.conn = this.db.connect();

    // Create messages table
    await this.runQuery(`
      CREATE TABLE IF NOT EXISTS messages (
        id VARCHAR PRIMARY KEY,
        from_participant VARCHAR NOT NULL,
        to_participant VARCHAR NOT NULL,
        content TEXT NOT NULL,
        timestamp BIGINT NOT NULL,
        read BOOLEAN DEFAULT false,
        priority VARCHAR CHECK (priority IN ('low', 'normal', 'high')) DEFAULT 'normal',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes
    await this.runQuery('CREATE INDEX IF NOT EXISTS idx_to_participant ON messages(to_participant)');
    await this.runQuery('CREATE INDEX IF NOT EXISTS idx_timestamp ON messages(timestamp)');
    await this.runQuery('CREATE INDEX IF NOT EXISTS idx_read ON messages(read)');
    await this.runQuery('CREATE INDEX IF NOT EXISTS idx_from_participant ON messages(from_participant)');

    this.initialized = true;

    // Start periodic Parquet export
    this.startPeriodicExport();

    console.error(`MessageRouter initialized: ${this.dbPath}`);
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

    // Generate message
    const message: Message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      from: options.from,
      to: options.to,
      content: options.content,
      timestamp: Date.now(),
      read: false,
      priority: options.priority || 'normal',
    };

    // Handle broadcast
    if (options.to === 'broadcast') {
      return await this.broadcastMessage(message);
    }

    // Insert direct message
    await this.runQuery(
      `INSERT INTO messages (id, from_participant, to_participant, content, timestamp, read, priority)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        message.id,
        message.from,
        message.to,
        message.content,
        message.timestamp,
        message.read,
        message.priority,
      ]
    );

    return message;
  }

  /**
   * Broadcast message to all participants except sender
   */
  private async broadcastMessage(message: Message): Promise<Message> {
    const recipients = Array.from(this.participants).filter(
      (p) => p !== message.from
    );

    // Insert a message for each recipient
    for (const recipient of recipients) {
      const broadcastMsg: Message = {
        ...message,
        id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        to: recipient,
      };

      await this.runQuery(
        `INSERT INTO messages (id, from_participant, to_participant, content, timestamp, read, priority)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          broadcastMsg.id,
          broadcastMsg.from,
          broadcastMsg.to,
          broadcastMsg.content,
          broadcastMsg.timestamp,
          broadcastMsg.read,
          broadcastMsg.priority,
        ]
      );
    }

    // Return the original broadcast message
    return message;
  }

  /**
   * Get messages for a participant
   */
  async getMessages(
    participantId: string,
    options: GetMessagesOptions = {}
  ): Promise<Message[]> {
    await this.ensureInitialized();

    let query = `
      SELECT id, from_participant as "from", to_participant as "to",
             content, timestamp, read, priority
      FROM messages
      WHERE to_participant = ?
    `;
    const params: any[] = [participantId];

    if (options.unreadOnly) {
      query += ' AND read = false';
    }

    if (options.since) {
      query += ' AND timestamp >= ?';
      params.push(options.since);
    }

    // Sort by priority (high to low) and timestamp (oldest first)
    query += `
      ORDER BY
        CASE priority
          WHEN 'high' THEN 3
          WHEN 'normal' THEN 2
          WHEN 'low' THEN 1
        END DESC,
        timestamp ASC
    `;

    if (options.limit && options.limit > 0) {
      query += ' LIMIT ?';
      params.push(options.limit);
    }

    const rows = await this.runQuery(query, params);
    return rows as Message[];
  }

  /**
   * Mark a message as read
   */
  async markRead(messageId: string): Promise<boolean> {
    await this.ensureInitialized();

    const result = await this.runQuery(
      'UPDATE messages SET read = true WHERE id = ?',
      [messageId]
    );

    return result && result.length > 0;
  }

  /**
   * Mark multiple messages as read
   */
  async markMultipleRead(messageIds: string[]): Promise<number> {
    await this.ensureInitialized();

    if (messageIds.length === 0) return 0;

    const placeholders = messageIds.map(() => '?').join(',');
    const result = await this.runQuery(
      `UPDATE messages SET read = true WHERE id IN (${placeholders})`,
      messageIds
    );

    return result ? result.length : 0;
  }

  /**
   * Register a participant (agent or developer)
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
   * Get all registered participants
   */
  getRegisteredParticipants(): string[] {
    return Array.from(this.participants);
  }

  /**
   * Clear all messages for a participant
   */
  async clearMessages(participantId: string): Promise<void> {
    await this.ensureInitialized();

    await this.runQuery('DELETE FROM messages WHERE to_participant = ?', [
      participantId,
    ]);
  }

  /**
   * Get message statistics
   */
  async getStats(): Promise<{
    totalParticipants: number;
    totalMessages: number;
    unreadMessages: number;
  }> {
    await this.ensureInitialized();

    const [totalMessages] = await this.runQuery(
      'SELECT COUNT(*) as count FROM messages'
    );
    const [unreadMessages] = await this.runQuery(
      'SELECT COUNT(*) as count FROM messages WHERE read = false'
    );

    return {
      totalParticipants: this.participants.size,
      totalMessages: (totalMessages as any).count || 0,
      unreadMessages: (unreadMessages as any).count || 0,
    };
  }

  /**
   * Export messages to Parquet format
   */
  async exportToParquet(): Promise<void> {
    await this.ensureInitialized();

    await this.runQuery(
      `COPY messages TO '${this.parquetPath}' (FORMAT PARQUET)`
    );

    console.error(`Messages exported to Parquet: ${this.parquetPath}`);
  }

  /**
   * Start periodic Parquet export
   */
  private startPeriodicExport(): void {
    if (this.exportTimer) {
      clearInterval(this.exportTimer);
    }

    this.exportTimer = setInterval(() => {
      this.exportToParquet().catch((err) =>
        console.error('Parquet export failed:', err)
      );
    }, this.exportInterval);
  }

  /**
   * Stop periodic Parquet export
   */
  stopPeriodicExport(): void {
    if (this.exportTimer) {
      clearInterval(this.exportTimer);
      this.exportTimer = undefined;
    }
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    this.stopPeriodicExport();

    // Final export before closing
    await this.exportToParquet().catch(() => {});

    if (this.conn) {
      await new Promise<void>((resolve) => {
        this.conn.close(() => resolve());
      });
    }

    if (this.db) {
      await new Promise<void>((resolve) => {
        this.db.close(() => resolve());
      });
    }

    this.initialized = false;
  }

  /**
   * Helper: Ensure database is initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * Helper: Run a query
   */
  private async runQuery(sql: string, params: any[] = []): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.conn.all(sql, ...params, (err: Error | null, rows: any[]) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  }
}
