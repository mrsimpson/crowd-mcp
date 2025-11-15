#!/usr/bin/env node

const { spawn } = require("child_process");

async function testPrompt(containerId) {
  console.log(`🧪 Testing prompt to container ${containerId}`);

  const execProcess = spawn("docker", [
    "exec",
    "-i",
    containerId,
    "opencode",
    "acp",
  ]);

  let messageId = 1;
  let sessionId = null;

  execProcess.stdout.on("data", (data) => {
    const lines = data
      .toString()
      .split("\n")
      .filter((line) => line.trim());
    lines.forEach((line) => {
      try {
        const response = JSON.parse(line);
        console.log("← Received:", JSON.stringify(response, null, 2));

        if (response.result?.sessionId) {
          sessionId = response.result.sessionId;
          console.log(`✅ Session ID: ${sessionId}`);
        }
      } catch (e) {
        console.log("← Raw:", line);
      }
    });
  });

  function send(message) {
    const msg = { ...message, id: messageId++ };
    const json = JSON.stringify(msg);
    console.log("→ Sending:", JSON.stringify(msg, null, 2));
    execProcess.stdin.write(json + "\n");
  }

  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Quick handshake
  send({
    jsonrpc: "2.0",
    method: "initialize",
    params: {
      protocolVersion: 1,
      capabilities: { roots: { listChanged: true }, sampling: {} },
      clientInfo: { name: "prompt-test", version: "1.0.0" },
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 2000));

  send({
    jsonrpc: "2.0",
    method: "session/new",
    params: {
      cwd: "/workspace",
      mcpServers: [],
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 3000));

  if (sessionId) {
    console.log("\n=== Sending Prompt ===");
    send({
      jsonrpc: "2.0",
      method: "session/prompt",
      params: {
        sessionId: sessionId,
        prompt: [
          {
            type: "text",
            text: "Hello! Can you respond with a simple greeting?",
          },
        ],
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 8000));
  } else {
    console.log("❌ No session ID, cannot send prompt");
  }

  console.log("\n=== Test Complete ===");
  execProcess.kill();
}

const containerId = process.argv[2] || "97ca5332fb57";
testPrompt(containerId).catch(console.error);
