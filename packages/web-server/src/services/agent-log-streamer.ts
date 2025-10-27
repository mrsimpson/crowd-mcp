import type Dockerode from "dockerode";
import type { AgentRegistry } from "../registry/agent-registry.js";

/**
 * Service for streaming agent logs from Docker containers
 * Separates log streaming concerns from the AgentRegistry
 */
export class AgentLogStreamer {
  constructor(
    private registry: AgentRegistry,
    private docker: Dockerode,
  ) {}

  /**
   * Create a streaming log connection for an agent
   * @param id - Agent ID
   * @param tail - Number of recent lines to include (default: 100)
   * @returns ReadableStream of Docker logs
   */
  async streamAgentLogs(
    id: string,
    tail?: number,
  ): Promise<NodeJS.ReadableStream> {
    const agent = this.registry.getAgent(id);
    if (!agent) {
      throw new Error("Agent not found");
    }

    const container = this.docker.getContainer(agent.containerId);

    const logStream = await container.logs({
      stdout: true,
      stderr: true,
      follow: true, // Stream logs in real-time
      tail: tail || 100, // Default to last 100 lines
      timestamps: false,
    });

    return logStream;
  }

  /**
   * Get static logs for an agent (non-streaming)
   * @param id - Agent ID
   * @param tail - Number of recent lines to retrieve
   * @returns Log content as string
   */
  async getAgentLogs(id: string, tail?: number): Promise<string> {
    const agent = this.registry.getAgent(id);
    if (!agent) {
      throw new Error("Agent not found");
    }

    const container = this.docker.getContainer(agent.containerId);

    const logStream = await container.logs({
      stdout: true,
      stderr: true,
      tail: tail || 0, // 0 means all logs
      timestamps: false,
    });

    return logStream.toString("utf-8");
  }
}
