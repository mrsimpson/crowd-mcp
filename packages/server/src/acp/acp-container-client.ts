import { spawn, ChildProcess } from 'child_process';
import type { AcpMcpServer } from '../agent-config/acp-mcp-converter.js';
import { ACPLogger } from './acp-logger.js';

export class ACPContainerClient {
  private sessionId?: string;
  private isInitialized = false;
  private execProcess?: ChildProcess;
  private requestId = 1;
  private currentResponse = '';
  private responseCallback?: (response: string) => void;
  private logger?: ACPLogger;
  private sessionNewRequestId?: number; // Track the session/new request ID

  constructor(
    private agentId: string,
    private containerId: string,
    private messageRouter?: any,
    private mcpServers: AcpMcpServer[] = []
  ) {}

  async initialize(): Promise<void> {
    try {
      // Initialize logging first
      this.logger = await ACPLogger.create(this.agentId);
      await this.logger.clientCreated(this.containerId);
      
      console.log(`🔌 Initializing ACP client for agent ${this.agentId}, container ${this.containerId}`);
      console.log(`📋 MCP servers to configure: ${this.mcpServers.length}`);
      
      await this.logger.sessionCreated(this.containerId, this.mcpServers);
      
      await this.startACPViaExec();
      await this.performHandshake();
      this.isInitialized = true;
      console.log(`✅ ACP client initialized for agent ${this.agentId}`);
    } catch (error) {
      if (this.logger) {
        await this.logger.connectionError(error);
      }
      console.error(`❌ Failed to initialize ACP client for agent ${this.agentId}:`, error);
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
        
        // Process lines synchronously to maintain order
        for (const line of lines) {
          this.processMessage(line);
        }
      });

      this.execProcess.stderr?.on('data', (data) => {
        console.log(`← [${this.agentId}] Error:`, data.toString());
      });

      this.execProcess.on('error', reject);
      this.execProcess.on('close', () => {
        console.log(`🔌 ACP process closed for agent ${this.agentId}`);
        this.isInitialized = false;
      });

      // Give process more time to start and be ready for ACP
      setTimeout(() => {
        console.log(`✅ ACP started via docker exec for agent ${this.agentId}`);
        resolve();
      }, 5000);  // Increased from 2000 to 5000ms
    });
  }

  private async performHandshake(): Promise<void> {
    // 1. Initialize
    await this.sendMessage({
      jsonrpc: '2.0',
      method: 'initialize',
      params: {
        protocolVersion: 1,
        capabilities: { roots: { listChanged: true }, sampling: {} },
        clientInfo: { name: 'crowd-mcp', version: '1.0.0' }
      }
    });

    await this.delay(2000);

    // 2. Create Session - this session will be used for all subsequent communication
    const sessionRequest = {
      jsonrpc: '2.0',
      method: 'session/new',
      params: {
        cwd: '/workspace',
        mcpServers: this.mcpServers
      }
    };
    
    // Track this request ID so we can match the response
    this.sessionNewRequestId = this.requestId;
    await this.sendMessage(sessionRequest);

    console.log(`📋 Created session with ${this.mcpServers.length} MCP servers for ${this.agentId}`);

    // Poll for session ID with exponential backoff
    await this.waitForSessionId();

    if (!this.sessionId) {
      throw new Error(`Failed to create session for agent ${this.agentId} - no session ID received`);
    }

    console.log(`✅ Session established for ${this.agentId}: ${this.sessionId}`);
  }

  private processMessage(line: string): void {
    try {
      const message = JSON.parse(line);
      console.log(`← [${this.agentId}] Received:`, JSON.stringify(message, null, 2));
      
      // Log the response (async but don't await to maintain sync processing)
      if (this.logger) {
        this.logger.sessionResponse(message).catch(console.error);
      }
      
      // Capture session ID from session/new response (match request ID)
      if (message.result?.sessionId && message.id === this.sessionNewRequestId) {
        this.sessionId = message.result.sessionId;
        console.log(`✅ Session ID captured for ${this.agentId}: ${this.sessionId}`);
      }
      
      // Handle streaming agent responses - maintain order by processing synchronously
      if (message.method === 'session/update' && message.params?.update?.sessionUpdate === 'agent_message_chunk') {
        const content = message.params.update.content?.text || '';
        this.currentResponse += content;
        console.log(`📝 [${this.agentId}] Agent response chunk: "${content}"`);
      }
      
      // Handle completion - send response back to messaging system
      if (message.result?.stopReason === 'end_turn') {
        console.log(`✅ [${this.agentId}] Agent completed response: "${this.currentResponse}"`);
        
        if (this.currentResponse.trim() && this.messageRouter) {
          // Log message forwarding (async but don't await)
          if (this.logger) {
            this.logger.messageForwarded({
              type: 'agent_response',
              content: this.currentResponse.trim()
            }, 'developer').catch(console.error);
          }
          
          // Send agent response back to developer via message router
          this.messageRouter.send({
            from: this.agentId,
            to: 'developer',
            content: this.currentResponse.trim()
          }).then(() => {
            console.log(`📤 [${this.agentId}] Sent response back to developer via message router`);
          }).catch((error: any) => {
            console.error(`❌ [${this.agentId}] Failed to send response to message router:`, error);
          });
        }
        
        // Reset for next response
        this.currentResponse = '';
      }
    } catch (e) {
      console.log(`← [${this.agentId}] Raw:`, line);
    }
  }

  private async waitForSessionId(): Promise<void> {
    const maxAttempts = 8;
    let attempt = 0;
    let delay = 500; // Start with 500ms

    if (this.logger) {
      await this.logger.debug("Starting exponential backoff polling for session ID", {
        maxAttempts,
        initialDelay: delay
      });
    }

    while (attempt < maxAttempts && !this.sessionId) {
      await this.delay(delay);
      attempt++;
      
      if (!this.sessionId) {
        delay = Math.min(delay * 2, 5000); // Cap at 5 seconds
        console.log(`⏳ Waiting for session ID (attempt ${attempt}/${maxAttempts}, next delay: ${delay}ms)`);
        
        if (this.logger) {
          await this.logger.debug("Session ID polling attempt", {
            attempt,
            maxAttempts,
            nextDelay: delay,
            sessionIdReceived: !!this.sessionId
          });
        }
      }
    }

    if (this.logger) {
      await this.logger.debug("Session ID polling completed", {
        totalAttempts: attempt,
        sessionIdReceived: !!this.sessionId,
        sessionId: this.sessionId
      });
    }
  }

  private async sendMessage(message: any): Promise<void> {
    if (!this.execProcess?.stdin) {
      throw new Error('ACP process not available');
    }

    const msg = { ...message, id: this.requestId++ };
    const json = JSON.stringify(msg);
    
    // Log the request
    if (this.logger) {
      await this.logger.sessionRequest(msg);
    }
    
    console.log(`→ [${this.agentId}] Sending:`, JSON.stringify(msg, null, 2));
    
    this.execProcess.stdin.write(json + '\n');
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async sendPrompt(message: { content: string; from: string; timestamp: Date | number }): Promise<void> {
    if (!this.sessionId || !this.isInitialized) {
      throw new Error(`ACP client not initialized for agent ${this.agentId}`);
    }

    try {
      // Convert timestamp to Date if it's a number
      const timestamp = typeof message.timestamp === 'number' 
        ? new Date(message.timestamp) 
        : message.timestamp;

      await this.sendMessage({
        jsonrpc: '2.0',
        method: 'session/prompt',
        params: {
          sessionId: this.sessionId,
          prompt: [{
            type: 'text',
            text: `Message from ${message.from} at ${timestamp.toISOString()}:\n${message.content}`
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
    
    if (this.logger) {
      await this.logger.clientDestroyed();
    }
    
    if (this.execProcess) {
      this.execProcess.kill();
      this.execProcess = undefined;
    }
    
    this.isInitialized = false;
    this.sessionId = undefined;
  }
}
