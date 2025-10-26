/**
 * Minimal types for crowd-mcp MVP
 */

export interface Agent {
  id: string;
  task: string;
  containerId: string;
  status?: 'initializing' | 'idle' | 'working' | 'blocked' | 'stopped';
  capabilities?: string[];
  startTime?: number;
}

export interface Message {
  id: string;
  from: string;
  to: string;
  content: string;
  timestamp: number;
  read: boolean;
  priority: 'low' | 'normal' | 'high';
}

export interface BroadcastMessage {
  id: string;
  from: string;
  content: string;
  timestamp: number;
}
