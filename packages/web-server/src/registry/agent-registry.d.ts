import { EventEmitter } from 'events';
import type Dockerode from 'dockerode';
import type { Agent } from '@crowd-mcp/shared';
export declare class AgentRegistry extends EventEmitter {
    private docker;
    private agents;
    constructor(docker: Dockerode);
    syncFromDocker(): Promise<void>;
    listAgents(): Agent[];
    getAgent(id: string): Agent | undefined;
    registerAgent(agent: Agent): void;
    updateAgent(id: string, update: Partial<Agent>): void;
    removeAgent(id: string): void;
    stopAgent(id: string): Promise<void>;
}
//# sourceMappingURL=agent-registry.d.ts.map