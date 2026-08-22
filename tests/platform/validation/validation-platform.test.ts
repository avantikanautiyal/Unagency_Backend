import {
  setupValidationPlatform,
  sampleValidationRunRequest,
} from "../../../src/platform/validation/testing";
import {
  E2E_VALIDATION_SCENARIOS,
  getValidationScenario,
} from "../../../src/platform/validation/scenarios/end-to-end-scenarios";
import { VALIDATION_SUITES } from "../../../src/platform/validation/suites/validation-suites";
import { runFailureSimulations } from "../../../src/platform/validation/failure/failure-simulator";
import { runRecoveryTests } from "../../../src/platform/validation/recovery/recovery-testing-engine";
import { buildReportBundle } from "../../../src/platform/validation/reports/report-writer";
import {
  assertNoSecretLeakage,
  assertTenantIsolation,
} from "../../../src/platform/validation/assertions/assertion-framework";

describe("Production Validation Platform (M9.1)", () => {
  it("defines all required E2E scenarios with stages", () => {
    expect(E2E_VALIDATION_SCENARIOS.length).toBeGreaterThanOrEqual(6);
    for (const s of E2E_VALIDATION_SCENARIOS) {
      expect(s.stages.length).toBeGreaterThan(0);
      expect(getValidationScenario(s.scenarioId)).toBeDefined();
    }
  });

  it("defines validation suites", () => {
    expect(VALIDATION_SUITES.length).toBeGreaterThanOrEqual(4);
    expect(VALIDATION_SUITES[0]!.scenarioIds.length).toBeGreaterThanOrEqual(6);
  });

  it("runs failure simulation catalog", () => {
    const sims = runFailureSimulations();
    expect(sims.length).toBe(15);
    expect(sims.every((s) => s.passed)).toBe(true);
  });

  it("runs recovery tests", () => {
    const tests = runRecoveryTests();
    expect(tests.length).toBeGreaterThanOrEqual(7);
    expect(tests.every((t) => t.passed)).toBe(true);
  });

  it("assertion framework detects secret patterns", () => {
    const bad = assertNoSecretLeakage({ apiKey: "sk-abcdefghijklmnop" });
    expect(bad.status).toBe("fail");
    const good = assertNoSecretLeakage({ executionId: "exec_1" });
    expect(good.status).toBe("pass");
  });

  it("assertion framework enforces tenant isolation", () => {
    const ok = assertTenantIsolation("org_a", "org_a");
    expect(ok.status).toBe("pass");
    const bad = assertTenantIsolation("org_b", "org_a");
    expect(bad.status).toBe("fail");
  });

  it("runs gateway_e2e validation with reports", async () => {
    const { orchestrator } = await setupValidationPlatform();
    const result = await orchestrator.runWithReports(
      sampleValidationRunRequest({
        runId: "val_gateway_e2e",
        scenarioIds: ["gateway_e2e"],
        includeLoadTesting: true,
        loadProfile: "load_10",
      })
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const bundle = result.value;
    expect(bundle.runReport.success).toBe(true);
    expect(bundle.runReport.securityResults.length).toBeGreaterThan(0);
    expect(bundle.runReport.failureSimulations.length).toBe(15);
    expect(bundle.runReport.recoveryTests.length).toBeGreaterThan(0);
    expect(bundle.runReport.loadMetrics).toBeDefined();
    expect(bundle.runReport.certification.overallPercent).toBeGreaterThan(80);
    expect(bundle.validationReportMd).toContain("VALIDATION REPORT");
    expect(bundle.certificationReportMd).toContain("Production Readiness");
    expect(bundle.securityReportMd).toContain("SECURITY REPORT");
    expect(bundle.coverageReportMd).toContain("COVERAGE REPORT");
  }, 120000);

  it("generates all nine report artifacts", async () => {
    const { orchestrator } = await setupValidationPlatform();
    const run = await orchestrator.run(
      sampleValidationRunRequest({
        runId: "val_reports",
        scenarioIds: ["research_merge"],
        includeSecurityValidation: false,
        includeLoadTesting: false,
      })
    );
    expect(run.ok).toBe(true);
    if (!run.ok) return;

    const bundle = buildReportBundle(run.value);
    expect(bundle.validationReportMd.length).toBeGreaterThan(50);
    expect(bundle.endToEndReportMd).toContain("research_merge");
    expect(bundle.failureReportMd).toContain("FAILURE REPORT");
    expect(bundle.recoveryReportMd).toContain("RECOVERY REPORT");
    expect(bundle.performanceReportMd).toContain("PERFORMANCE REPORT");
    expect(bundle.loadTestReportMd).toContain("Load testing not included");
  }, 60000);

  it("rejects empty runId", async () => {
    const { orchestrator } = await setupValidationPlatform();
    const result = await orchestrator.run({ runId: "  " });
    expect(result.ok).toBe(false);
  });
});
