/**
 * SpawnTracker manages parent-child agent relationships and enforces spawn limits
 */
export interface SpawnRecord {
  childAgentId: string;
  parentAgentId: string;
  spawnedAt: number;
  task: string;
}

export class SpawnTracker {
  private spawnRecords: Map<string, SpawnRecord> = new Map();
  private maxSpawnsPerAgent: number;

  constructor(maxSpawnsPerAgent: number = 5) {
    this.maxSpawnsPerAgent = maxSpawnsPerAgent;
  }

  /**
   * Record that an agent spawned another agent
   */
  recordSpawn(
    parentAgentId: string,
    childAgentId: string,
    task: string,
  ): SpawnRecord {
    const record: SpawnRecord = {
      childAgentId,
      parentAgentId,
      spawnedAt: Date.now(),
      task,
    };

    this.spawnRecords.set(childAgentId, record);
    return record;
  }

  /**
   * Remove a spawn record when an agent is stopped
   */
  removeSpawn(childAgentId: string): void {
    this.spawnRecords.delete(childAgentId);
  }

  /**
   * Get all agents spawned by a specific parent
   */
  getSpawnedAgents(parentAgentId: string): SpawnRecord[] {
    return Array.from(this.spawnRecords.values()).filter(
      (record) => record.parentAgentId === parentAgentId,
    );
  }

  /**
   * Get the parent of a specific agent
   */
  getParent(childAgentId: string): string | null {
    const record = this.spawnRecords.get(childAgentId);
    return record ? record.parentAgentId : null;
  }

  /**
   * Check if an agent can spawn more agents
   */
  canSpawn(parentAgentId: string): boolean {
    const spawnedCount = this.getSpawnedAgents(parentAgentId).length;
    return spawnedCount < this.maxSpawnsPerAgent;
  }

  /**
   * Get remaining spawn capacity for an agent
   */
  getRemainingSpawns(parentAgentId: string): number {
    const spawnedCount = this.getSpawnedAgents(parentAgentId).length;
    return Math.max(0, this.maxSpawnsPerAgent - spawnedCount);
  }

  /**
   * Get spawn count for an agent
   */
  getSpawnCount(parentAgentId: string): number {
    return this.getSpawnedAgents(parentAgentId).length;
  }

  /**
   * Set max spawns per agent (can be updated at runtime)
   */
  setMaxSpawnsPerAgent(max: number): void {
    this.maxSpawnsPerAgent = max;
  }

  /**
   * Get max spawns per agent
   */
  getMaxSpawnsPerAgent(): number {
    return this.maxSpawnsPerAgent;
  }

  /**
   * Clear all spawn records (useful for testing)
   */
  clear(): void {
    this.spawnRecords.clear();
  }
}
