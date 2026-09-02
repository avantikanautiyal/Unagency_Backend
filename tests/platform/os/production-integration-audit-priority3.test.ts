/**
 * Priority 3 — Production integration audit (deterministic, zero paid API calls).
 */

jest.mock(
  "../../../src/platform/os/evaluation/output-validation/output-contract-validation-engine",
  () => {
    const actual = jest.requireActual(
      "../../../src/platform/os/evaluation/output-validation/output-contract-validation-engine",
    );
    return actual;
  },
);

jest.mock("../../../src/platform/os/evaluation/artifact-evaluation", () => ({
  createArtifactHydrator: jest.fn(),
  mergeArtifactEvaluationIntoValidationInput: jest.fn((input: { base: unknown }) => input.base),
  runArtifactEvaluation: jest.fn(),
}));

import {
  runProductionIntegrationAudit,
  formatProductionIntegrationAuditReport,
  assessKnownIntegrationFailures,
  logProductionIntegrationAudit,
} from "../../../src/platform/os/observability/production-integration-audit";
import { PRODUCTION_AUDIT_PREFIX } from "../../../src/platform/os/observability/production-integration-audit-contract";
import { loadAdaptiveRoutingConfig } from "../../../src/platform/providers/routing/performance/config/adaptive-routing-config";
import { PRODUCTION_LIFECYCLE_STAGE_CATALOG } from "../../../src/platform/os/observability/production-integration-audit-contract";

describe("Priority 3 — Production integration audit", () => {
  it("runs full deterministic audit with zero failures", async () => {
    const result = await runProductionIntegrationAudit({
      env: Object.freeze({ ...process.env, ADAPTIVE_ROUTING_ENABLED: "false" }),
    });
    expect(result.summary.paidProviderCalls).toBe(0);
    expect(result.summary.adaptiveRoutingEnabled).toBe(false);
    expect(result.summary.failed).toBe(0);
    expect(result.entries.length).toBeGreaterThan(20);
  });

  it("verifies all seven representative modalities against service catalog", async () => {
    const result = await runProductionIntegrationAudit();
    const modalityEntries = result.entries.filter((e) =>
      e.stage.startsWith("classification_"),
    );
    expect(modalityEntries).toHaveLength(7);
    expect(modalityEntries.every((e) => e.status === "PASS")).toBe(true);
  });

  it("verifies provider lineage uses actual identity distinct from requested when fallback", async () => {
    const result = await runProductionIntegrationAudit();
    const lineage = result.entries.find((e) => e.stage === "provider_identity_lineage");
    expect(lineage?.status).toBe("PASS");
    expect(lineage?.evidence).toContain("actual=provider.openai");
    expect(lineage?.evidence).toContain("fallback=true");
  });

  it("verifies production evidence remains observational", async () => {
    const result = await runProductionIntegrationAudit();
    const evidence = result.entries.find((e) => e.stage === "production_evidence_observational");
    expect(evidence?.status).toBe("PASS");
    expect(evidence?.evidence).toContain("mode=observational");
    expect(evidence?.evidence).toContain("comparison=false");
  });

  it("verifies durable observability persistence fields", async () => {
    const result = await runProductionIntegrationAudit();
    const obs = result.entries.find((e) => e.stage === "durable_observability_persisted");
    expect(obs?.status).toBe("PASS");
    expect(obs?.evidence).toContain("step2=COMPLETED");
    expect(obs?.evidence).toContain("evidence=RECORDED");
  });

  it("verifies graceful degradation does not fail execution", async () => {
    const result = await runProductionIntegrationAudit();
    const degrade = result.entries.filter((e) => e.stage.startsWith("degradation_"));
    expect(degrade.every((e) => e.status === "PASS")).toBe(true);
  });

  it("classifies four known integration failures as infrastructure not production defects", () => {
    const assessments = assessKnownIntegrationFailures();
    expect(assessments).toHaveLength(4);
    expect(
      assessments.every(
        (a) =>
          a.classification === "missing_test_infrastructure" ||
          a.classification === "environment_configuration",
      ),
    ).toBe(true);
    expect(assessments.some((a) => a.suite.includes("express-firebase-auth"))).toBe(true);
  });

  it("formats readable audit report", async () => {
    const result = await runProductionIntegrationAudit();
    const report = formatProductionIntegrationAuditReport(result);
    expect(report).toContain("PRIORITY 3");
    expect(report).toContain("provider_identity_lineage");
    expect(report).toContain("INTEGRATION TEST FAILURES");
  });

  it("logs with production audit prefix", async () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
    const result = await runProductionIntegrationAudit();
    logProductionIntegrationAudit(result);
    const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toContain(PRODUCTION_AUDIT_PREFIX);
    logSpy.mockRestore();
  });

  it("adaptive routing remains OFF", () => {
    expect(loadAdaptiveRoutingConfig({ ADAPTIVE_ROUTING_ENABLED: "false" }).adaptiveRoutingEnabled).toBe(
      false,
    );
  });

  it("documents distributed sync dispatch trace wiring", () => {
    const catalog = assessKnownIntegrationFailures();
    expect(catalog.length).toBe(4);
    const dispatchStage = PRODUCTION_LIFECYCLE_STAGE_CATALOG.find(
      (s) => s.stage === "provider_dispatch",
    );
    expect(dispatchStage?.productionEntry).toContain("distributed-sync");
  });
});
