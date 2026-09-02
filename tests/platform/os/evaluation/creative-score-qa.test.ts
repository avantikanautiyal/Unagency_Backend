/**
 * Track B3 — Creative Score evaluator + release gate tests.
 */

import {
  CREATIVE_SCORE_RELEASE_GATE,
  CREATIVE_SCORE_DIMENSIONS,
} from "../../../../src/platform/os/evaluation/creative-score/creative-score-dimensions";
import { judgeCreativeScore } from "../../../../src/platform/os/evaluation/creative-score/creative-score-judge";
import {
  creativeQaFromScoreResult,
  creativeQaExtras,
} from "../../../../src/platform/os/evaluation/creative-score/creative-qa-gate";
import { CreativeScoreEvaluator } from "../../../../src/platform/os/evaluation/evaluators/creative-score-evaluator";
import { createOsGovernanceEngine } from "../../../../src/platform/os/governance/governance-engine";
import { createDefaultGovernancePolicy } from "../../../../src/platform/os/governance/policy";
import { createOsEvaluationEngine } from "../../../../src/platform/os/evaluation/engine/evaluation-engine";

const BASE_INPUT = {
  organizationId: "org_b3",
  executionId: "exec_b3",
  planId: "plan_b3",
  planVersion: 1,
  outputContractId: "output.copy",
  objective: "Instagram feed post for Diwali sale using our logo and brand colors navy gold",
  briefObjective: "Instagram feed post for Diwali sale using our logo and brand colors navy gold",
  brandTone: "premium confident",
  brandVoice: "warm direct",
  service: "social",
  preview: "",
  nowIso: () => "2026-08-25T12:00:00.000Z",
  createId: (p: string) => `${p}_test`,
};

describe("Track B3 Creative Score QA", () => {
  const prevQa = process.env.CREATIVE_QA;

  afterEach(() => {
    if (prevQa === undefined) delete process.env.CREATIVE_QA;
    else process.env.CREATIVE_QA = prevQa;
  });

  it("defines ten creative dimensions", () => {
    expect(CREATIVE_SCORE_DIMENSIONS).toHaveLength(10);
    expect(CREATIVE_SCORE_RELEASE_GATE).toBe(80);
  });

  it("scores strong on-brand social copy at or above release gate", () => {
    process.env.CREATIVE_QA = "on";
    const judged = judgeCreativeScore({
      ...BASE_INPUT,
      preview:
        "Diwali sale — 20% off Northstar Coffee.\n\nPremium confident tone for Instagram feed.\nHeadline: Celebrate with navy and gold.\nCTA: Shop the launch post today.",
      brandPreferredTerms: ["Northstar", "navy", "gold"],
    });
    expect(judged.totalScore).toBeGreaterThanOrEqual(CREATIVE_SCORE_RELEASE_GATE);
    expect(judged.releaseAllowed).toBe(true);
  });

  it("blocks release below 80 when CREATIVE_QA=on", () => {
    process.env.CREATIVE_QA = "on";
    const judged = judgeCreativeScore({
      ...BASE_INPUT,
      preview: "ok",
    });
    expect(judged.totalScore).toBeLessThan(CREATIVE_SCORE_RELEASE_GATE);
    const gate = creativeQaFromScoreResult(judged);
    expect(gate.blockedRelease).toBe(true);
    expect(gate.blockReason).toMatch(/below release gate/);
  });

  it("shadow mode observes but does not block", () => {
    process.env.CREATIVE_QA = "shadow";
    const judged = judgeCreativeScore({ ...BASE_INPUT, preview: "short" });
    const gate = creativeQaFromScoreResult(judged);
    expect(gate.blockedRelease).toBe(false);
    expect(gate.totalScore).toBeLessThan(CREATIVE_SCORE_RELEASE_GATE);
  });

  it("evaluator returns BLOCKED outcome below gate when on", () => {
    process.env.CREATIVE_QA = "on";
    const evaluator = new CreativeScoreEvaluator();
    const result = evaluator.evaluate({
      ...BASE_INPUT,
      preview: "tiny",
    });
    expect(result.outcome).toBe("BLOCKED");
    expect(result.scores.creativeScoreTotal).toBeLessThan(80);
    expect(result.findings.some((f) => f.code === "CREATIVE_SCORE_BELOW_GATE")).toBe(
      true
    );
  });

  it("governance blocks execution when creative score below gate", () => {
    process.env.CREATIVE_QA = "on";
    const engine = createOsEvaluationEngine();
    const aggregate = engine.evaluateOutput({
      ...BASE_INPUT,
      preview: "tiny output",
    });
    const governance = createOsGovernanceEngine(
      createDefaultGovernancePolicy("org_b3")
    );
    const decision = governance.decideFromEvaluation({
      aggregate,
      scope: "execution",
      providerSuccess: true,
    });
    expect(decision.action).toBe("BLOCK");
    expect(decision.blocking).toBe(true);
    expect(decision.reason).toMatch(/below release gate/);
  });

  it("extras surface dimension breakdown for FE/admin", () => {
    process.env.CREATIVE_QA = "on";
    const judged = judgeCreativeScore({ ...BASE_INPUT, preview: "placeholder todo: fix" });
    const gate = creativeQaFromScoreResult(judged);
    const extras = creativeQaExtras(gate);
    expect(extras?.creativeQa).toBeDefined();
    expect((extras!.creativeQa as { dimensionScores: Record<string, number> }).dimensionScores).toBeDefined();
  });
});
