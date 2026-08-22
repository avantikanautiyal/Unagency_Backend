import {
  createGovernanceFinalizeService,
} from "../../../src/platform/os/governance/finalize";
import {
  finalizeExecutionGovernanceExtras,
  previewFromJobSummary,
  resolveOutputContractId,
} from "../../../src/platform/api/services/execution-governance-extras";

describe("execution-governance-extras", () => {
  it("maps capabilities to output contracts", () => {
    expect(resolveOutputContractId("text.generate")).toBe("output.copy");
    expect(resolveOutputContractId("output.social_caption")).toBe(
      "output.social_caption"
    );
  });

  it("extracts preview from job summary", () => {
    expect(
      previewFromJobSummary({ resultText: "Hello campaign copy" })
    ).toBe("Hello campaign copy");
  });

  it("runs Phase 6 finalize for single execution", () => {
    const finalize = createGovernanceFinalizeService();
    const result = finalizeExecutionGovernanceExtras({
      governanceFinalize: finalize,
      organizationId: "org_test",
      executionId: "exec_test",
      capabilityId: "text.generate",
      objective: "Write social caption",
      preview: "Launch day is here — shop now.",
      providerSuccess: true,
      nowIso: () => "2026-01-01T00:00:00.000Z",
      createId: (p) => `${p}_1`,
    });
    expect(result.governance.checks.length).toBeGreaterThan(0);
    expect(result.governance.action).toBeDefined();
    expect(result.evaluation.executionId).toBe("exec_test");
  });
});
