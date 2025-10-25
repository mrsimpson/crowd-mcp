#!/usr/bin/env node
import Docker from 'dockerode';

async function attachToAgent(agentId: string) {
  const docker = new Docker();
  const containerName = `agent-${agentId}`;

  try {
    const container = docker.getContainer(containerName);

    // Check if container exists
    await container.inspect();

    console.log(`Attaching to ${containerName}...`);
    console.log('Press Ctrl+C to detach');

    // Exec into container with TTY
    const exec = await container.exec({
      Cmd: ['/bin/sh'],
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      Tty: true,
    });

    const stream = await exec.start({
      hijack: true,
      stdin: true,
      Tty: true,
    });

    // Forward stdio
    process.stdin.setRawMode?.(true);
    process.stdin.pipe(stream);
    stream.pipe(process.stdout);

    // Handle resize
    if (process.stdout.isTTY) {
      process.stdout.on('resize', () => {
        exec.resize({
          h: process.stdout.rows || 24,
          w: process.stdout.columns || 80,
        });
      });
    }

    // Cleanup on exit
    stream.on('end', () => {
      process.stdin.setRawMode?.(false);
      process.exit(0);
    });

    // Handle Ctrl+C
    process.on('SIGINT', () => {
      process.stdin.setRawMode?.(false);
      console.log('\nDetached from agent');
      process.exit(0);
    });
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
    }
    process.exit(1);
  }
}

// Parse CLI args
const command = process.argv[2];
const agentId = process.argv[3];

if (command === 'attach' && agentId) {
  attachToAgent(agentId);
} else {
  console.log('Usage: crowd-mcp-cli attach <agent-id>');
  process.exit(1);
}
