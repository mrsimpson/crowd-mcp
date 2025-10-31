/**
 * Minimal types for crowd-mcp MVP
 */

/**
 * Special participant ID for the human developer using the MCP host
 */
export const DEVELOPER_ID = "developer";

/**
 * Special participant ID for broadcast messages (all participants)
 */
export const BROADCAST_ID = "broadcast";

export interface Agent {
  id: string;
  task: string;
  containerId: string;
  status?: "initializing" | "idle" | "working" | "blocked" | "stopped";
  capabilities?: string[];
  startTime?: number;
  agentType?: string; // Type of agent from .crowd/agents/{agentType}.yaml
  workspace?: string; // Workspace directory for the agent
}

/**
 * Message between participants (agent-to-agent, agent-to-developer, developer-to-agent)
 *
 * Participants:
 * - Agent IDs: 'agent-{timestamp}'
 * - Developer: 'developer'
 * - Broadcast: 'broadcast' (sends to all participants)
 */
export interface Message {
  id: string;
  /** Sender ID (agent ID or 'developer') */
  from: string;
  /** Recipient ID (agent ID, 'developer', or 'broadcast') */
  to: string;
  content: string;
  timestamp: number;
  read: boolean;
  priority: "low" | "normal" | "high";
}
