import {
  setupProductionValidation,
  sampleValidationRequest,
  listScenarioIds,
} from "../../../src/platform/production/testing";
import {
  PRODUCTION_SCENARIO_LIBRARY,
  getScenario,
} from "../../../src/platform/production/scenarios/scenario-library";
import { analyzeFailure } from "../../../src/platform/production/diagnostics/failure-analysis";
import { buildReadinessScore, buildCertifications } from "../../../src/platform/production/certification/build-certification";
import type { ValidationCheckResult } from "../../../src/platform/production/contracts/metrics";

describe("Production Validation Framework", () => {
  it("has a scenario for every required domain", () => {
    const domains = new Set(PRODUCTION_SCENARIO_LIBRARY.map((s) => s.domain));
    for (const d of [
      "marketing",
      "software_development",
      "research",
      "image_generation",
      "video_generation",
      "audio_generation",
      "translation",
      "customer_support",
      "sales",
      "legal",
      "healthcare",
      "education",
      "retail",
      "hospitality",
      "manufacturing",
      "finance",
      "hr",
    ]) {
      expect(domains.has(d as never)).toBe(true);
    }
    expect(listScenarioIds().length).toBe(17);
    for (const s of PRODUCTION_SCENARIO_LIBRARY) {
      expect(s.expectations.expectedCapabilities.length).toBeGreaterThan(0);
      expect(s.expectations.expectedQualityThreshold).toBeGreaterThan(0);
      expect(s.expectations.expectedLatencyMsMax).toBeGreaterThan(0);
    }
  });

  it("executes retail scenario through full OS with OpenAI leaf", async () => {
    const { engine, reportStore } = await setupProductionValidation();
    const result = await engine.validate(sampleValidationRequest("scn_retail"));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const report = result.value;
    expect(report.providerMode).toBe("simulated");
    expect(report.executionMode).toBe("openai_simulated");
    expect(report.integration?.success).toBe(true);
    expect(report.integration?.artifacts.runtime).toBeDefined();
    expect(report.integration?.artifacts.capability).toBeDefined();
    expect(report.integration?.artifacts.evaluation).toBeDefined();
    expect(report.integration?.artifacts.learning).toBeDefined();
    expect(report.integration?.artifacts.consensus).toBeDefined();
    expect(report.checks.some((c) => c.checkId === "provider_runtime")).toBe(true);
    expect(report.executionTrace.correlationId).toBe("corr_prod_1");
    expect(report.executionTrace.stageTimings.length).toBeGreaterThan(0);
    expect(report.benchmark.executionLatencyMs).toBeGreaterThanOrEqual(0);
    expect(report.certifications.length).toBeGreaterThanOrEqual(5);
    expect(report.readiness.grade).toBeDefined();
    expect(reportStore.list().length).toBe(1);
    expect(report.failedCheckCount).toBe(0);
    expect(report.success).toBe(true);
  }, 120000);

  it("rejects empty requestId", async () => {
    const { engine } = await setupProductionValidation();
    const result = await engine.validate({
      requestId: "  ",
      scenarioId: "scn_marketing",
    });
    expect(result.ok).toBe(false);
  });

  it("analyzes failures without automatic repair", () => {
    const checks: ValidationCheckResult[] = [
      {
        checkId: "provider_runtime",
        area: "provider",
        status: "fail",
        message: "Provider runtime missing or failed",
      },
    ];
    const analysis = analyzeFailure(undefined, checks);
    expect(analysis.failed).toBe(true);
    expect(analysis.suggestedFix).toMatch(/No automatic repair/);
    expect(analysis.responsibleModule).toBeDefined();
  });

  it("builds readiness score from certifications", () => {
    const checks: ValidationCheckResult[] = [
      { checkId: "a", area: "execution", status: "pass", message: "ok" },
      { checkId: "b", area: "provider", status: "pass", message: "ok" },
      { checkId: "c", area: "capability", status: "pass", message: "ok" },
      { checkId: "d", area: "workflow", status: "pass", message: "ok" },
    ];
    const benchmark = {
      providerLatencyMs: 10,
      executionLatencyMs: 100,
      promptTokens: 1,
      completionTokens: 1,
      cost: 0,
      retryCount: 0,
      streamingChunkCount: 0,
      evaluationScore: 0.9,
      humanReviewRequired: false,
      capturedAt: "2026-07-15T00:00:00.000Z",
    };
    const certs = buildCertifications(checks, benchmark, true);
    const { readiness } = buildReadinessScore(checks, certs, true);
    expect(readiness.overall).toBeGreaterThan(0.7);
    expect(readiness.readyForProduction).toBe(true);
  });

  it("runs a small suite across domains", async () => {
    const { engine } = await setupProductionValidation();
    const suite = await engine.validateSuite({
      requestId: "suite_1",
      scenarioIds: ["scn_marketing", "scn_finance"],
      mode: "openai_simulated",
    });
    expect(suite.ok).toBe(true);
    if (!suite.ok) return;
    expect(suite.value.total).toBe(2);
    expect(suite.value.passed).toBe(2);
    expect(suite.value.averageReadiness).toBeGreaterThan(0);
  }, 180000);

  it("looks up scenarios by id", () => {
    expect(getScenario("scn_legal")?.domain).toBe("legal");
    expect(getScenario("missing")).toBeUndefined();
  });
});
