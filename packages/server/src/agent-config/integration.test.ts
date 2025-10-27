import { describe, it, expect } from "vitest";
import { AgentDefinitionLoader } from "./agent-definition-loader.js";
import { join } from "path";

describe("Agent Configuration Integration", () => {
  it("should load example agent definitions from workspace", async () => {
    const loader = new AgentDefinitionLoader();
    // Use the project root directory
    const workspaceDir = join(process.cwd(), "../..");

    const agentTypes = await loader.list(workspaceDir);

    // We should have at least the 3 example agents
    expect(agentTypes.length).toBeGreaterThanOrEqual(3);
    expect(agentTypes).toContain("architect");
    expect(agentTypes).toContain("coder");
    expect(agentTypes).toContain("reviewer");
  });

  it("should load architect agent with correct configuration", async () => {
    const loader = new AgentDefinitionLoader();
    const workspaceDir = join(process.cwd(), "../..");

    const architect = await loader.load(workspaceDir, "architect");

    expect(architect.name).toBe("architect");
    expect(architect.displayName).toBe("Software Architect");
    expect(architect.systemPrompt).toContain("software architect");
    expect(architect.preferredModels).toContain("claude-sonnet-4.5-20250929");
    expect(architect.capabilities).toContain("system-design");
    expect(architect.llmSettings?.temperature).toBe(0.3);
  });

  it("should load coder agent with correct configuration", async () => {
    const loader = new AgentDefinitionLoader();
    const workspaceDir = join(process.cwd(), "../..");

    const coder = await loader.load(workspaceDir, "coder");

    expect(coder.name).toBe("coder");
    expect(coder.displayName).toBe("Implementation Specialist");
    expect(coder.systemPrompt).toContain("expert software developer");
    expect(coder.preferredModels).toContain("claude-sonnet-4.5-20250929");
    expect(coder.capabilities).toContain("implementation");
    expect(coder.llmSettings?.temperature).toBe(0.2);
  });

  it("should load reviewer agent with correct configuration", async () => {
    const loader = new AgentDefinitionLoader();
    const workspaceDir = join(process.cwd(), "../..");

    const reviewer = await loader.load(workspaceDir, "reviewer");

    expect(reviewer.name).toBe("reviewer");
    expect(reviewer.displayName).toBe("Code Reviewer");
    expect(reviewer.systemPrompt).toContain("code reviewer");
    expect(reviewer.preferredModels).toContain("claude-sonnet-4.5-20250929");
    expect(reviewer.capabilities).toContain("code-review");
    expect(reviewer.llmSettings?.temperature).toBe(0.4);
    expect(reviewer.llmSettings?.reasoningEffort).toBe("high");
  });

  it("should generate description with available agent types", async () => {
    const loader = new AgentDefinitionLoader();
    const workspaceDir = join(process.cwd(), "../..");

    const agentTypes = await loader.list(workspaceDir);

    const description = `Optional: The type of agent to spawn. Available types: ${agentTypes.join(", ")}. If not specified, uses the default configuration.`;

    expect(description).toContain("architect");
    expect(description).toContain("coder");
    expect(description).toContain("reviewer");
  });
});
