#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import Dockerode from 'dockerode';
import { ContainerManager } from './docker/container-manager.js';
import { McpServer } from './mcp-server.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

async function main() {
  const docker = new Dockerode();
  const containerManager = new ContainerManager(docker);
  const mcpServer = new McpServer(containerManager);

  const server = new Server(
    {
      name: 'crowd-mcp',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'spawn_agent',
        description: 'Spawn a new autonomous agent in a Docker container',
        inputSchema: {
          type: 'object',
          properties: {
            task: {
              type: 'string',
              description: 'The task for the agent to work on',
            },
          },
          required: ['task'],
        },
      },
    ],
  }));

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === 'spawn_agent') {
      const { task } = request.params.arguments as { task: string };

      const result = await mcpServer.handleSpawnAgent(task);

      return {
        content: [
          {
            type: 'text',
            text: `Agent spawned successfully!\nID: ${result.agentId}\nTask: ${result.task}\nContainer: ${result.containerId}`,
          },
        ],
      };
    }

    throw new Error(`Unknown tool: ${request.params.name}`);
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('crowd-mcp server running on stdio');
}

main().catch(console.error);
