import { ACPClientManager } from './acp-client-manager.js';

export interface Message {
  content: string;
  from: string;
  to: string;
  timestamp: Date;
}

export class ACPMessageForwarder {
  constructor(private acpClientManager: ACPClientManager) {}

  async forwardMessage(message: Message): Promise<void> {
    // Only forward to agent recipients that have ACP clients
    if (message.to.startsWith('agent-') && this.acpClientManager.hasClient(message.to)) {
      await this.acpClientManager.forwardMessage(message.to, {
        content: message.content,
        from: message.from,
        timestamp: message.timestamp
      });
    }
  }
}
