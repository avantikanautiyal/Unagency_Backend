/**
 * Circuit-open user-facing copy must not claim alternate-model failover
 * unless the Direct candidate list actually includes failover steps.
 */

import assert from "node:assert/strict";
import { userFacingCircuitOpenMessage } from "../../../src/platform/direct/direct-execution-engine";

describe("userFacingCircuitOpenMessage (fanout ≠ failover)", () => {
  it("single candidate (fanout leaf / no failover) — no alternate-model claim", () => {
    const msg = userFacingCircuitOpenMessage({ candidateCount: 1 });
    assert.match(msg, /cooling down/i);
    assert.doesNotMatch(msg, /alternate models/i);
    assert.doesNotMatch(msg, /automatically/i);
  });

  it("multi-candidate failover — preserves alternate-model claim when eligible remain", () => {
    const msg = userFacingCircuitOpenMessage({
      candidateCount: 3,
      eligibleRemaining: 1,
    });
    assert.match(msg, /cooling down/i);
    assert.match(msg, /alternate models/i);
  });

  it("multi-candidate but all ineligible — no false alternate-model claim", () => {
    const msg = userFacingCircuitOpenMessage({
      candidateCount: 3,
      eligibleRemaining: 0,
    });
    assert.match(msg, /All eligible AI providers are temporarily unavailable/i);
    assert.doesNotMatch(msg, /alternate models/i);
  });
});
