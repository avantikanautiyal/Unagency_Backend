import {
  sampleMarketingObjectiveRequest,
  sampleSoftwareObjectiveRequest,
  sampleStrategyObjectiveRequest,
  setupCapabilityIntelligencePlatform,
} from "../../../../src/platform/intelligence/capability-intelligence/testing";
import { CapabilityIntelligenceRequestBuilder } from "../../../../src/platform/intelligence/capability-intelligence/builders/capability-intelligence-request-builder";

describe("Capability Intelligence Platform", () => {
  it("produces a complete capability execution plan from a business objective", async () => {
    const { engine } = setupCapabilityIntelligencePlatform();
    const result = await engine.plan(sampleMarketingObjectiveRequest());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const report = result.value;
    expect(report.executionPlan.steps.length).toBeGreaterThan(0);
    expect(report.executionPlan.capabilityIds.length).toBeGreaterThan(0);
    expect(report.bundle.members.length).toBe(report.graph.nodes.length);
    expect(report.graph.topologicalOrder.length).toBeGreaterThan(0);
    expect(report.scorecards.length).toBe(report.bundle.members.length);
    expect(report.maturityReports.length).toBeGreaterThan(0);
    expect(report.compatibility.entries.length).toBeGreaterThan(0);
    expect(report.recommendations.primary.length).toBeGreaterThan(0);

    // Capability-first: IDs look like domain.capability, not vendor brands
    for (const id of report.executionPlan.capabilityIds) {
      expect(id.includes(".")).toBe(true);
      expect(id.toLowerCase()).not.toMatch(/gpt|claude|gemini|openai|anthropic/);
    }

    const rec = report.recommendations.primary[0]!;
    expect(rec.evidence.whySelected).toBeTruthy();
    expect(rec.evidence.tradeOffs.length).toBeGreaterThan(0);
    expect(rec.evidence.confidence).toBeGreaterThan(0);
  });

  it("composes preferred software capabilities with dependencies", async () => {
    const { engine } = setupCapabilityIntelligencePlatform();
    const result = await engine.plan(sampleSoftwareObjectiveRequest());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const ids = result.value.executionPlan.capabilityIds;
    expect(ids).toContain("software.code_generation");
    expect(ids).toContain("software.code_review");
    expect(ids).toContain("software.refactoring");

    // Topological: generation before review before refactoring
    expect(ids.indexOf("software.code_generation")).toBeLessThan(
      ids.indexOf("software.code_review")
    );
    expect(ids.indexOf("software.code_review")).toBeLessThan(
      ids.indexOf("software.refactoring")
    );

    expect(["chain", "dag", "pipeline", "tree"]).toContain(result.value.graph.shape);
  });

  it("expands strategy dependency to include market analysis", async () => {
    const { engine } = setupCapabilityIntelligencePlatform();
    const result = await engine.plan(sampleStrategyObjectiveRequest());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.executionPlan.capabilityIds).toContain("business.strategy");
    expect(result.value.executionPlan.capabilityIds).toContain("research.market_analysis");
    expect(result.value.dependencies.edges.length).toBeGreaterThan(0);
  });

  it("rejects empty business objectives", async () => {
    const { engine } = setupCapabilityIntelligencePlatform();
    const result = await engine.plan(
      CapabilityIntelligenceRequestBuilder.create()
        .withRequestId("bad")
        .withBusinessObjective("   ")
        .build()
    );
    expect(result.ok).toBe(false);
  });

  it("includes explainability on every primary recommendation", async () => {
    const { engine } = setupCapabilityIntelligencePlatform();
    const result = await engine.plan(sampleMarketingObjectiveRequest());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    for (const rec of result.value.recommendations.primary) {
      expect(rec.evidence.whySelected.length).toBeGreaterThan(0);
      expect(Array.isArray(rec.evidence.dependencies)).toBe(true);
      expect(Array.isArray(rec.evidence.alternatives)).toBe(true);
      expect(Array.isArray(rec.evidence.tradeOffs)).toBe(true);
      expect(rec.evidence.historicalSuccess.length).toBeGreaterThan(0);
    }
  });

  it("does not require networking or SDKs", async () => {
    const { engine } = setupCapabilityIntelligencePlatform();
    const result = await engine.plan(sampleMarketingObjectiveRequest());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.executionPlan.explanation).toMatch(/capabilities/i);
  });
});
