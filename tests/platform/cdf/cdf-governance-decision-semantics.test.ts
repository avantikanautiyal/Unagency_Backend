/**
 * Governance decision semantics — REJECT is blocking only when provider is terminal.
 * Observational placeholder decisions must not be represented as REJECT + execute.
 */

import { defaultGovernanceEngine } from "../../../src/platform/os/governance/types";

describe("governance execution decision semantics", () => {
  it("placeholder in-flight decide is CONTINUE_WITH_GAPS (not REJECT)", () => {
    const decision = defaultGovernanceEngine.decide({
      evaluationScore: null,
      evaluationPlaceholder: true,
      humanReviewFlag: false,
      providerSuccess: true,
      nowIso: () => "2026-01-01T00:00:00.000Z",
    });
    expect(decision.action).toBe("CONTINUE_WITH_GAPS");
    expect(decision.blocking).toBe(false);
  });

  it("provider failure decide is REJECT with blocking=true", () => {
    const decision = defaultGovernanceEngine.decide({
      evaluationScore: null,
      evaluationPlaceholder: false,
      humanReviewFlag: false,
      providerSuccess: false,
      nowIso: () => "2026-01-01T00:00:00.000Z",
    });
    expect(decision.action).toBe("REJECT");
    expect(decision.blocking).toBe(true);
  });
});
