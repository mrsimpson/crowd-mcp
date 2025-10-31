/**
 * SpawnTracker
 *
 * Tracks parent-child relationships between agents and enforces spawn limits.
 * Used to prevent agents from spawning more children than allowed.
 */

/**
 * Tracks which agents have spawned which other agents
 */
export class SpawnTracker {
  // Maps parent agent ID to array of child agent IDs
  private parentToChildren: Map<string, string[]> = new Map();

  // Maps child agent ID to parent agent ID
  private childToParent: Map<string, string> = new Map();

  /**
   * Record that a parent agent has spawned a child agent
   */
  recordSpawn(parentId: string, childId: string): void {
    // Add to parent's children list
    const children = this.parentToChildren.get(parentId) || [];
    children.push(childId);
    this.parentToChildren.set(parentId, children);

    // Record parent relationship
    this.childToParent.set(childId, parentId);
  }

  /**
   * Get the number of agents spawned by a parent agent
   */
  getSpawnCount(parentId: string): number {
    return this.parentToChildren.get(parentId)?.length || 0;
  }

  /**
   * Check if an agent can spawn another agent given a limit
   */
  canSpawn(parentId: string, maxSpawns: number): boolean {
    const currentCount = this.getSpawnCount(parentId);
    return currentCount < maxSpawns;
  }

  /**
   * Get all child agent IDs spawned by a parent agent
   */
  getChildren(parentId: string): string[] {
    return this.parentToChildren.get(parentId) || [];
  }

  /**
   * Get the parent agent ID for a child agent
   */
  getParent(childId: string): string | undefined {
    return this.childToParent.get(childId);
  }

  /**
   * Remove an agent from tracking (cleanup when agent is stopped)
   */
  removeAgent(agentId: string): void {
    // Get children before removing (to clean up their parent relationships)
    const children = this.getChildren(agentId);

    // Remove as parent (clear its children list)
    this.parentToChildren.delete(agentId);

    // Remove parent relationship for all children
    for (const childId of children) {
      this.childToParent.delete(childId);
    }

    // Remove as child (clear its parent relationship)
    this.childToParent.delete(agentId);

    // Remove from any parent's children list
    for (const [parentId, children] of this.parentToChildren.entries()) {
      const filteredChildren = children.filter((id) => id !== agentId);
      if (filteredChildren.length !== children.length) {
        this.parentToChildren.set(parentId, filteredChildren);
      }
    }
  }

  /**
   * Get the number of remaining spawns allowed for an agent
   */
  getRemainingSpawns(parentId: string, maxSpawns: number): number {
    const currentCount = this.getSpawnCount(parentId);
    const remaining = maxSpawns - currentCount;
    return Math.max(0, remaining);
  }
}
