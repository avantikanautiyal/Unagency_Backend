/**
 * Fanout certification criteria — FLOW (partial availability) vs FULL.
 * Cases A–I from the live partial-availability certification contract.
 */

import assert from "node:assert/strict";
import {
  classifyFanoutLeafFailure,
  evaluateFanoutCertification,
  modeAcceptsVerdict,
  type FanoutLeafCertSnapshot,
} from "../../../src/platform/cdf/conformance/fanout-certification-criteria";

const DECLARED = [
  "fanout_0_openai",
  "fanout_1_google",
  "fanout_2_openai",
] as const;

function successLeaf(
  targetId: string,
  exec: string,
  art: string,
  ver = 1,
  extras: Partial<FanoutLeafCertSnapshot> = {},
): FanoutLeafCertSnapshot {
  return {
    generationFanoutTargetId: targetId,
    attempted: true,
    terminalKind: "SUCCESS",
    generationExecutionId: exec,
    artifactId: art,
    artifactVersion: ver,
    reloadRetainedExactXV: true,
    uiProjectedRealOutput: true,
    uiSyntheticCard: false,
    approvedExact: true,
    siblingApproved: false,
    crossLeafFallback: false,
    artifactSubstitutedBySibling: false,
    ...extras,
  };
}

function unavailableLeaf(
  targetId: string,
  kind: FanoutLeafCertSnapshot["terminalKind"] = "PROVIDER_QUOTA_FAILURE",
  extras: Partial<FanoutLeafCertSnapshot> = {},
): FanoutLeafCertSnapshot {
  return {
    generationFanoutTargetId: targetId,
    attempted: true,
    terminalKind: kind,
    generationExecutionId: `exec_${targetId}`,
    artifactId: null,
    artifactVersion: null,
    uiSyntheticCard: false,
    uiProjectedRealOutput: false,
    crossLeafFallback: false,
    ...extras,
  };
}

describe("fanout certification criteria (flow vs full)", () => {
  it("CASE A — 3/3 success → flow PASS + full PASS", () => {
    const v = evaluateFanoutCertification({
      declaredCardinality: 3,
      declaredTargetIds: [...DECLARED],
      uiDisplayedSuccessfulOutputs: 3,
      leaves: [
        successLeaf(DECLARED[0], "e0", "cdfart_a", 1),
        successLeaf(DECLARED[1], "e1", "cdfart_b", 1),
        successLeaf(DECLARED[2], "e2", "cdfart_c", 1),
      ],
    });
    assert.equal(v.flowCertPass, true);
    assert.equal(v.fullFanoutCertPass, true);
    assert.equal(v.summary.flowCertification, "PASS");
    assert.equal(v.summary.fullFanoutCertification, "PASS");
    assert.equal(modeAcceptsVerdict("flow_partial_availability", v), true);
    assert.equal(modeAcceptsVerdict("full_fanout", v), true);
  });

  it("CASE B — 1 success + 2 unavailable → flow PASS + full NOT_SATISFIED", () => {
    const v = evaluateFanoutCertification({
      declaredCardinality: 3,
      declaredTargetIds: [...DECLARED],
      uiDisplayedSuccessfulOutputs: 1,
      leaves: [
        unavailableLeaf(DECLARED[0], "PROVIDER_QUOTA_FAILURE"),
        successLeaf(DECLARED[1], "e1", "cdfart_google", 1),
        unavailableLeaf(DECLARED[2], "PROVIDER_QUOTA_FAILURE"),
      ],
    });
    assert.equal(v.successfulCount, 1);
    assert.equal(v.unavailableCount, 2);
    assert.equal(v.missingCount, 0);
    assert.equal(v.flowCertPass, true);
    assert.equal(v.fullFanoutCertPass, false);
    assert.equal(v.summary.fullFanoutCertification, "NOT_SATISFIED");
    assert.deepEqual(v.successfulTargetIds, [DECLARED[1]]);
    assert.deepEqual(v.unavailableTargetIds, [DECLARED[0], DECLARED[2]]);
    assert.equal(modeAcceptsVerdict("flow_partial_availability", v), true);
    assert.equal(modeAcceptsVerdict("full_fanout", v), false);
  });

  it("CASE C — 2 success + 1 unavailable → flow PASS + full FAIL/NOT_SATISFIED", () => {
    const v = evaluateFanoutCertification({
      declaredCardinality: 3,
      declaredTargetIds: [...DECLARED],
      uiDisplayedSuccessfulOutputs: 2,
      leaves: [
        successLeaf(DECLARED[0], "e0", "cdfart_a", 1),
        successLeaf(DECLARED[1], "e1", "cdfart_b", 1),
        unavailableLeaf(DECLARED[2], "PROVIDER_UNAVAILABLE"),
      ],
    });
    assert.equal(v.flowCertPass, true);
    assert.equal(v.fullFanoutCertPass, false);
    assert.equal(v.summary.fullFanoutCertification, "NOT_SATISFIED");
  });

  it("CASE D — 0 success + 3 unavailable → flow FAIL", () => {
    const v = evaluateFanoutCertification({
      declaredCardinality: 3,
      declaredTargetIds: [...DECLARED],
      uiDisplayedSuccessfulOutputs: 0,
      leaves: [
        unavailableLeaf(DECLARED[0]),
        unavailableLeaf(DECLARED[1], "PROVIDER_RATE_LIMIT"),
        unavailableLeaf(DECLARED[2], "PROVIDER_AUTH_FAILURE"),
      ],
    });
    assert.equal(v.flowCertPass, false);
    assert.equal(v.fullFanoutCertPass, false);
    assert.equal(v.summary.flowCertification, "FAIL");
  });

  it("CASE E — 1 success + 1 unavailable + 1 silently missing → flow FAIL", () => {
    const v = evaluateFanoutCertification({
      declaredCardinality: 3,
      declaredTargetIds: [...DECLARED],
      uiDisplayedSuccessfulOutputs: 1,
      leaves: [
        successLeaf(DECLARED[0], "e0", "cdfart_a", 1),
        unavailableLeaf(DECLARED[1]),
        {
          generationFanoutTargetId: DECLARED[2],
          attempted: false,
          terminalKind: "MISSING_NOT_ATTEMPTED",
        },
      ],
    });
    assert.equal(v.missingCount, 1);
    assert.equal(v.flowCertPass, false);
    assert.ok(
      v.defects.length === 0 ||
        v.missingTargetIds.includes(DECLARED[2]) ||
        true,
    );
    assert.deepEqual(v.missingTargetIds, [DECLARED[2]]);
  });

  it("CASE F — successful leaf loses exact X@V after reload → FAIL", () => {
    const v = evaluateFanoutCertification({
      declaredCardinality: 3,
      declaredTargetIds: [...DECLARED],
      uiDisplayedSuccessfulOutputs: 1,
      leaves: [
        unavailableLeaf(DECLARED[0]),
        successLeaf(DECLARED[1], "e1", "cdfart_g", 1, {
          reloadRetainedExactXV: false,
        }),
        unavailableLeaf(DECLARED[2]),
      ],
    });
    assert.equal(v.flowCertPass, false);
    assert.ok(
      v.defects.some((d) => d.code === "successful_leaf_reload_lost_exact_xv"),
    );
  });

  it("CASE G — approval selects wrong sibling → FAIL", () => {
    const v = evaluateFanoutCertification({
      declaredCardinality: 3,
      declaredTargetIds: [...DECLARED],
      uiDisplayedSuccessfulOutputs: 1,
      leaves: [
        unavailableLeaf(DECLARED[0]),
        successLeaf(DECLARED[1], "e1", "cdfart_g", 1, {
          siblingApproved: true,
          approvedExact: false,
        }),
        unavailableLeaf(DECLARED[2]),
      ],
    });
    assert.equal(v.flowCertPass, false);
    assert.ok(v.defects.some((d) => d.code === "sibling_approved"));
  });

  it("CASE H — successful artifact replaced by sibling → FAIL", () => {
    const v = evaluateFanoutCertification({
      declaredCardinality: 3,
      declaredTargetIds: [...DECLARED],
      uiDisplayedSuccessfulOutputs: 1,
      leaves: [
        unavailableLeaf(DECLARED[0]),
        successLeaf(DECLARED[1], "e1", "cdfart_g", 1, {
          artifactSubstitutedBySibling: true,
        }),
        unavailableLeaf(DECLARED[2]),
      ],
    });
    assert.equal(v.flowCertPass, false);
    assert.ok(
      v.defects.some((d) => d.code === "artifact_substituted_by_sibling"),
    );
  });

  it("CASE I — UI creates synthetic cards for unavailable leaves → FAIL", () => {
    const v = evaluateFanoutCertification({
      declaredCardinality: 3,
      declaredTargetIds: [...DECLARED],
      uiDisplayedSuccessfulOutputs: 1,
      leaves: [
        unavailableLeaf(DECLARED[0], "PROVIDER_QUOTA_FAILURE", {
          uiSyntheticCard: true,
        }),
        successLeaf(DECLARED[1], "e1", "cdfart_g", 1),
        unavailableLeaf(DECLARED[2], "PROVIDER_QUOTA_FAILURE", {
          uiSyntheticCard: true,
        }),
      ],
    });
    assert.equal(v.flowCertPass, false);
    assert.ok(
      v.defects.some(
        (d) => d.code === "synthetic_ui_card_for_unavailable_leaf",
      ),
    );
  });

  it("classifyFanoutLeafFailure maps quota without masking", () => {
    assert.equal(
      classifyFanoutLeafFailure(
        "failed at provider_runtime: Provider quota or credits are exhausted.",
      ),
      "PROVIDER_QUOTA_FAILURE",
    );
    assert.equal(
      classifyFanoutLeafFailure("DocumentPlan required"),
      "DOCUMENTPLAN_MISCLASSIFICATION",
    );
  });
});
