/**
 * Tests for SpawnTracker
 */
import { describe, it, expect, beforeEach } from "vitest";
import { SpawnTracker } from "./spawn-tracker.js";

describe("SpawnTracker", () => {
  let tracker: SpawnTracker;

  beforeEach(() => {
    tracker = new SpawnTracker();
  });

  describe("recordSpawn", () => {
    it("should record a spawn for a parent agent", () => {
      tracker.recordSpawn("agent-1", "agent-2");
      expect(tracker.getSpawnCount("agent-1")).toBe(1);
    });

    it("should record multiple spawns for the same parent", () => {
      tracker.recordSpawn("agent-1", "agent-2");
      tracker.recordSpawn("agent-1", "agent-3");
      tracker.recordSpawn("agent-1", "agent-4");
      expect(tracker.getSpawnCount("agent-1")).toBe(3);
    });

    it("should track spawns for different parent agents independently", () => {
      tracker.recordSpawn("agent-1", "agent-2");
      tracker.recordSpawn("agent-1", "agent-3");
      tracker.recordSpawn("agent-4", "agent-5");

      expect(tracker.getSpawnCount("agent-1")).toBe(2);
      expect(tracker.getSpawnCount("agent-4")).toBe(1);
    });
  });

  describe("getSpawnCount", () => {
    it("should return 0 for agent that has not spawned anything", () => {
      expect(tracker.getSpawnCount("agent-1")).toBe(0);
    });

    it("should return accurate count after multiple spawns", () => {
      tracker.recordSpawn("agent-1", "agent-2");
      tracker.recordSpawn("agent-1", "agent-3");
      expect(tracker.getSpawnCount("agent-1")).toBe(2);
    });
  });

  describe("canSpawn", () => {
    it("should return true when under the limit", () => {
      tracker.recordSpawn("agent-1", "agent-2");
      expect(tracker.canSpawn("agent-1", 5)).toBe(true);
    });

    it("should return false when at the limit", () => {
      tracker.recordSpawn("agent-1", "agent-2");
      tracker.recordSpawn("agent-1", "agent-3");
      expect(tracker.canSpawn("agent-1", 2)).toBe(false);
    });

    it("should return false when over the limit", () => {
      tracker.recordSpawn("agent-1", "agent-2");
      tracker.recordSpawn("agent-1", "agent-3");
      tracker.recordSpawn("agent-1", "agent-4");
      expect(tracker.canSpawn("agent-1", 2)).toBe(false);
    });

    it("should return true for agent with no spawns", () => {
      expect(tracker.canSpawn("agent-1", 5)).toBe(true);
    });

    it("should handle limit of 0 correctly", () => {
      expect(tracker.canSpawn("agent-1", 0)).toBe(false);
    });

    it("should handle limit of 1 correctly", () => {
      expect(tracker.canSpawn("agent-1", 1)).toBe(true);
      tracker.recordSpawn("agent-1", "agent-2");
      expect(tracker.canSpawn("agent-1", 1)).toBe(false);
    });
  });

  describe("getChildren", () => {
    it("should return empty array for agent with no children", () => {
      expect(tracker.getChildren("agent-1")).toEqual([]);
    });

    it("should return all children spawned by an agent", () => {
      tracker.recordSpawn("agent-1", "agent-2");
      tracker.recordSpawn("agent-1", "agent-3");
      tracker.recordSpawn("agent-1", "agent-4");

      const children = tracker.getChildren("agent-1");
      expect(children).toEqual(["agent-2", "agent-3", "agent-4"]);
    });

    it("should not include children spawned by other agents", () => {
      tracker.recordSpawn("agent-1", "agent-2");
      tracker.recordSpawn("agent-3", "agent-4");

      expect(tracker.getChildren("agent-1")).toEqual(["agent-2"]);
      expect(tracker.getChildren("agent-3")).toEqual(["agent-4"]);
    });
  });

  describe("getParent", () => {
    it("should return undefined for agent with no parent", () => {
      expect(tracker.getParent("agent-1")).toBeUndefined();
    });

    it("should return the parent agent id", () => {
      tracker.recordSpawn("agent-1", "agent-2");
      expect(tracker.getParent("agent-2")).toBe("agent-1");
    });

    it("should track multiple child-parent relationships", () => {
      tracker.recordSpawn("agent-1", "agent-2");
      tracker.recordSpawn("agent-1", "agent-3");
      tracker.recordSpawn("agent-2", "agent-4");

      expect(tracker.getParent("agent-2")).toBe("agent-1");
      expect(tracker.getParent("agent-3")).toBe("agent-1");
      expect(tracker.getParent("agent-4")).toBe("agent-2");
    });
  });

  describe("removeAgent", () => {
    it("should remove spawn count for agent", () => {
      tracker.recordSpawn("agent-1", "agent-2");
      tracker.recordSpawn("agent-1", "agent-3");
      expect(tracker.getSpawnCount("agent-1")).toBe(2);

      tracker.removeAgent("agent-1");
      expect(tracker.getSpawnCount("agent-1")).toBe(0);
    });

    it("should remove parent relationship for children", () => {
      tracker.recordSpawn("agent-1", "agent-2");
      expect(tracker.getParent("agent-2")).toBe("agent-1");

      tracker.removeAgent("agent-1");
      expect(tracker.getParent("agent-2")).toBeUndefined();
    });

    it("should handle removing agent that doesn't exist", () => {
      expect(() => tracker.removeAgent("agent-999")).not.toThrow();
    });
  });

  describe("getRemainingSpawns", () => {
    it("should return the full limit when no spawns have occurred", () => {
      expect(tracker.getRemainingSpawns("agent-1", 5)).toBe(5);
    });

    it("should return remaining spawns correctly", () => {
      tracker.recordSpawn("agent-1", "agent-2");
      tracker.recordSpawn("agent-1", "agent-3");
      expect(tracker.getRemainingSpawns("agent-1", 5)).toBe(3);
    });

    it("should return 0 when at limit", () => {
      tracker.recordSpawn("agent-1", "agent-2");
      tracker.recordSpawn("agent-1", "agent-3");
      expect(tracker.getRemainingSpawns("agent-1", 2)).toBe(0);
    });

    it("should return 0 when over limit", () => {
      tracker.recordSpawn("agent-1", "agent-2");
      tracker.recordSpawn("agent-1", "agent-3");
      tracker.recordSpawn("agent-1", "agent-4");
      expect(tracker.getRemainingSpawns("agent-1", 2)).toBe(0);
    });
  });
});
