import {
  sampleIntegrationRequest,
  setupIntelligenceOsIntegration,
} from "../../../../src/platform/intelligence/integration/testing";
import {
  isCompleteFullPipeline,
  summarizeTrace,
} from "../../../../src/platform/intelligence/integration/diagnostics";
import { INTEGRATION_PIPELINE_ORDER } from "../../../../src/platform/intelligence/integration/contracts/enums";

describe("Intelligence OS Integration", () => {
  it("runs a business request through the full pipeline via bridges", async () => {
    const { engine } = setupIntelligenceOsIntegration();
    const result = await engine.run(sampleIntegrationRequest());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.success).toBe(true);
    expect(isCompleteFullPipeline(result.value)).toBe(true);
    expect(result.value.trace.bridges.length).toBeGreaterThanOrEqual(17);
    expect(result.value.artifacts.task).toBeDefined();
    expect(result.value.artifacts.capability).toBeDefined();
    expect(result.value.artifacts.agentPlanning).toBeDefined();
    expect(result.value.artifacts.workflow).toBeDefined();
    expect(result.value.artifacts.governance).toBeDefined();
    expect(result.value.artifacts.experienceInjection).toBeDefined();
    expect(result.value.artifacts.executionIntelligence).toBeDefined();
    expect(result.value.artifacts.modelIntelligence).toBeDefined();
    expect(result.value.artifacts.negotiation).toBeDefined();
    expect(result.value.artifacts.routing).toBeDefined();
    expect(result.value.artifacts.runtime).toBeDefined();
    expect(result.value.artifacts.consensus).toBeDefined();
    expect(result.value.artifacts.evaluation).toBeDefined();
    expect(result.value.artifacts.evaluationIntelligence).toBeDefined();
    expect(result.value.artifacts.learning).toBeDefined();
    expect(result.value.artifacts.optimization).toBeDefined();
    expect(result.value.artifacts.experienceIntelligence).toBeDefined();
    expect(result.value.artifacts.repositoryUpdates).toBeDefined();

    for (const bridge of result.value.trace.bridges) {
      expect(bridge.correlationId).toBe("corr_ios_1");
      expect(bridge.durationMs).toBeGreaterThanOrEqual(0);
      expect(bridge.inputSummary).toBeDefined();
      expect(bridge.outputSummary).toBeDefined();
    }

    expect(summarizeTrace(result.value.trace)).toContain("task_intelligence");
  }, 60000);

  it("rejects empty raw prompts", async () => {
    const { engine } = setupIntelligenceOsIntegration();
    const result = await engine.run(
      sampleIntegrationRequest({ rawPrompt: "  ", requestId: "bad" })
    );
    expect(result.ok).toBe(false);
  });

  it("supports planning_through_routing mode without runtime", async () => {
    const { engine } = setupIntelligenceOsIntegration();
    const result = await engine.run(
      sampleIntegrationRequest({ mode: "planning_through_routing", requestId: "plan_only" })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.success).toBe(true);
    expect(result.value.stagesCompleted).toContain("routing");
    expect(result.value.stagesCompleted).not.toContain("provider_runtime");
    expect(result.value.artifacts.runtime).toBeUndefined();
  }, 60000);

  it("declares the full ordered stage list", () => {
    expect(INTEGRATION_PIPELINE_ORDER[0]).toBe("task_intelligence");
    expect(INTEGRATION_PIPELINE_ORDER[INTEGRATION_PIPELINE_ORDER.length - 1]).toBe(
      "repository_updates"
    );
    expect(INTEGRATION_PIPELINE_ORDER).toContain("capability_intelligence");
    expect(INTEGRATION_PIPELINE_ORDER).toContain("consensus");
  });
});
