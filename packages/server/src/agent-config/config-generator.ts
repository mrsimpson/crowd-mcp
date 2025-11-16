import type { AgentDefinitionLoader } from "./agent-definition-loader.js";
import { AcpMcpConverter, type AcpMcpServer } from "./acp-mcp-converter.js";
import { StderrLogger } from "../logging/stderr-logger.js";

/**
 * Config generation context
 */
export interface ConfigGenerationContext {
  agentId: string;
  agentMcpPort: number;
}

/**
 * ACP MCP server generation result
 */
export interface AcpMcpServerResult {
  mcpServers: AcpMcpServer[];
  cliName: string;
}

/**
 * Configuration Generator
 *
 * Generates ACP-compatible MCP server configurations from agent definitions.
 */
export class ConfigGenerator {
  private logger = new StderrLogger('ConfigGenerator');
  
  constructor(
    private loader: AgentDefinitionLoader,
    private cliName: string = "opencode",
  ) {}

  /**
   * Generate ACP MCP servers for an agent
   *
   * This method:
   * 1. Loads the agent definition from YAML (if exists)
   * 2. Converts MCP servers to ACP format
   * 3. Always includes messaging MCP server implicitly
   * 4. Returns ACP-compatible MCP server list
   *
   * @param agentName - Name of the agent (from .crowd/agents/{name}.yaml), optional
   * @param workspaceDir - Workspace root directory
   * @param context - Generation context with agent ID and ports
   * @returns Result with ACP MCP servers and CLI name
   */
  async generateAcpMcpServers(
    agentName: string | undefined,
    workspaceDir: string,
    context: ConfigGenerationContext,
  ): Promise<AcpMcpServerResult> {
    const mcpServers: AcpMcpServer[] = [];

    // Always include messaging MCP server
    const agentMcpUrl = `http://host.docker.internal:${context.agentMcpPort}/mcp`;
    mcpServers.push(AcpMcpConverter.createMessagingServer(agentMcpUrl, context.agentId));

    // Add agent-specific MCP servers if agent definition exists
    if (agentName) {
      try {
        const definition = await this.loader.load(workspaceDir, agentName);
        
        if (definition.mcpServers) {
          const agentMcpServers = AcpMcpConverter.convertToAcpFormat(
            definition.mcpServers,
          );
          mcpServers.push(...agentMcpServers);
        }
      } catch (error) {
        // Agent definition not found or invalid - just use messaging server
        this.logger.warn(
          `Could not load agent definition for ${agentName}, using messaging server only`,
          error,
        );
      }
    }

    return {
      mcpServers,
      cliName: this.cliName,
    };
  }
}
