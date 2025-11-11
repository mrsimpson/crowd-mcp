import { spawn, ChildProcess } from 'child_process';

export class ACPContainerClient {
  private sessionId?: string;
  private isInitialized = false;
  private execProcess?: ChildProcess;
  private requestId = 1;

  constructor(
    private agentId: string,
    private containerId: string
  ) {}

  async initialize(): Promise<void> {
    try {
      await this.startACPViaExec();
      await this.performHandshake();
      this.isInitialized = true;
      console.log(`✅ ACP client initialized for agent ${this.agentId}`);
    } catch (error) {
      throw new Error(`Failed to initialize ACP client for agent ${this.agentId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async startACPViaExec(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(`🔌 Starting ACP via docker exec for agent ${this.agentId}`);
      
      // Use docker exec with stdin attachment - proven to work
      this.execProcess = spawn('docker', [
        'exec', '-i',  // Interactive stdin
        this.containerId,
        'opencode', 'acp'
      ]);

      this.execProcess.stdout?.on('data', (data) => {
        const lines = data.toString().split('\n').filter((line: string) => line.trim());
        lines.forEach((line: string) => {
          try {
            const message = JSON.parse(line);
            console.log(`← [${this.agentId}] Received:`, JSON.stringify(message, null, 2));
            
            // Capture session ID from session/new response
            if (message.result?.sessionId) {
              this.sessionId = message.result.sessionId;
              console.log(`✅ Session ID captured for ${this.agentId}: ${this.sessionId}`);
            }
          } catch (e) {
            console.log(`← [${this.agentId}] Raw:`, line);
          }
        });
      });

      this.execProcess.stderr?.on('data', (data) => {
        console.log(`← [${this.agentId}] Error:`, data.toString());
      });

      this.execProcess.on('error', reject);
      this.execProcess.on('close', () => {
        console.log(`🔌 ACP process closed for agent ${this.agentId}`);
        this.isInitialized = false;
      });

      // Give process time to start
      setTimeout(() => {
        console.log(`✅ ACP started via docker exec for agent ${this.agentId}`);
        resolve();
      }, 2000);
    });
  }

  private async performHandshake(): Promise<void> {
    // 1. Initialize
    await this.sendMessage({
      jsonrpc: '2.0',
      method: 'initialize',
      params: {
        protocolVersion: 1,  // Correct protocol version
        capabilities: { roots: { listChanged: true }, sampling: {} },
        clientInfo: { name: 'crowd-mcp', version: '1.0.0' }
      }
    });

    await this.delay(2000);

    // 2. Create Session
    await this.sendMessage({
      jsonrpc: '2.0',
      method: 'session/new',
      params: {
        cwd: '/workspace',
        mcpServers: []  // Array, not object
      }
    });

    await this.delay(3000);

    if (!this.sessionId) {
      throw new Error(`Failed to create session for agent ${this.agentId}`);
    }
  }

  private async sendMessage(message: any): Promise<void> {
    if (!this.execProcess?.stdin) {
      throw new Error('ACP process not available');
    }

    const msg = { ...message, id: this.requestId++ };
    const json = JSON.stringify(msg);
    console.log(`→ [${this.agentId}] Sending:`, JSON.stringify(msg, null, 2));
    
    this.execProcess.stdin.write(json + '\n');
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async sendPrompt(message: { content: string; from: string; timestamp: Date }): Promise<void> {
    if (!this.sessionId || !this.isInitialized) {
      throw new Error(`ACP client not initialized for agent ${this.agentId}`);
    }

    try {
      await this.sendMessage({
        jsonrpc: '2.0',
        method: 'session/prompt',
        params: {
          sessionId: this.sessionId,
          prompt: [{
            type: 'text',
            text: `Message from ${message.from} at ${message.timestamp.toISOString()}:\n${message.content}`
          }]
        }
      });
      
      console.log(`✅ Prompt sent to agent ${this.agentId}`);
    } catch (error) {
      console.error(`Failed to send prompt to agent ${this.agentId}:`, error);
      throw error;
    }
  }

  isHealthy(): boolean {
    return this.isInitialized && !!this.sessionId && !!this.execProcess;
  }

  async cleanup(): Promise<void> {
    console.log(`🧹 Cleaning up ACP client for agent ${this.agentId}`);
    
    if (this.execProcess) {
      this.execProcess.kill();
      this.execProcess = undefined;
    }
    
    this.isInitialized = false;
    this.sessionId = undefined;
  }
}
