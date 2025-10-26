#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import Dockerode from "dockerode";
import { ContainerManager } from "./docker/container-manager.js";
import { McpServer } from "./mcp-server.js";
import { AgentRegistry, createHttpServer } from "@crowd-mcp/web-server";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

async function main() {
  const docker = new Dockerode();
  const containerManager = new ContainerManager(docker);

  // Create shared registry
  const registry = new AgentRegistry(docker);

  // Start HTTP server for web UI
  const httpPort = parseInt(process.env.HTTP_PORT || "3000", 10);
  try {
    await createHttpServer(registry, httpPort);
    console.error(`✓ HTTP server started successfully`);
    console.error(`  Web Dashboard: http://localhost:${httpPort}`);
    console.error(`  API Endpoint: http://localhost:${httpPort}/api/agents`);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(`✗ Failed to start HTTP server: ${errorMessage}`);
    console.error(`  Current HTTP_PORT: ${httpPort}`);
    console.error(
      `  Try setting a different port in your MCP client configuration:`,
    );
    console.error(`  "env": { "HTTP_PORT": "3001" }`);
    throw error;
  }

  // Create MCP server
  const mcpServer = new McpServer(containerManager, registry, httpPort);

  const server = new Server(
    {
      name: "crowd-mcp",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "spawn_agent",
        description: "Spawn a new autonomous agent in a Docker container",
        inputSchema: {
          type: "object",
          properties: {
            task: {
              type: "string",
              description: "The task for the agent to work on",
            },
          },
          required: ["task"],
        },
      },
      {
        name: "list_agents",
        description: "List all active agents with their status and details",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "stop_agent",
        description: "Stop a running agent and remove its container",
        inputSchema: {
          type: "object",
          properties: {
            agentId: {
              type: "string",
              description: "The ID of the agent to stop",
            },
          },
          required: ["agentId"],
        },
      },
    ],
  }));

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === "spawn_agent") {
      const { task } = request.params.arguments as { task: string };

      const result = await mcpServer.handleSpawnAgent(task);

      return {
        content: [
          {
            type: "text",
            text: `Agent spawned successfully!\n\nID: ${result.agentId}\nTask: ${result.task}\nContainer: ${result.containerId}\n\nView and control agents at:\n${result.dashboardUrl}`,
          },
        ],
      };
    }

    if (request.params.name === "list_agents") {
      const result = await mcpServer.handleListAgents();

      if (result.count === 0) {
        return {
          content: [
            {
              type: "text",
              text: "No agents currently running.",
            },
          ],
        };
      }

      const agentsList = result.agents
        .map(
          (agent, index) =>
            `${index + 1}. ${agent.id}\n   Task: ${agent.task}\n   Container: ${agent.containerId}`,
        )
        .join("\n\n");

      return {
        content: [
          {
            type: "text",
            text: `Active Agents (${result.count}):\n\n${agentsList}`,
          },
        ],
      };
    }

    if (request.params.name === "stop_agent") {
      const { agentId } = request.params.arguments as { agentId: string };

      const result = await mcpServer.handleStopAgent(agentId);

      return {
        content: [
          {
            type: "text",
            text: `Agent ${result.agentId} stopped successfully.`,
          },
        ],
      };
    }

    throw new Error(`Unknown tool: ${request.params.name}`);
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("crowd-mcp server running on stdio");
}

main().catch(console.error);
