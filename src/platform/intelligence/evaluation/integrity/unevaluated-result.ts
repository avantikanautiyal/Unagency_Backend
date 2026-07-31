/**
 * Soft unevaluated result for recursion / optional-eval skips.
 */

import {
  asCapabilityId,
  asExecutionId,
  asOrganizationId,
  asWorkspaceId,
} from "../../shared/identifiers";
import type { EvaluationResult } from "../contracts/evaluation-models";
import {
  integrityUnavailable,
  type EvaluationIntegrity,
} from "./evaluation-integrity";

export function buildUnevaluatedEvaluationResult(input: {
  readonly requestId: string;
  readonly reason: string;
  readonly integrity?: EvaluationIntegrity;
}): EvaluationResult {
  const integrity =
    input.integrity ?? integrityUnavailable({ reason: input.reason });
  const now = integrity.createdAt;
  return {
    report: {
      reportId: `eval_skip_${input.requestId}`,
      requestId: input.requestId,
      identity: {
        organizationId: asOrganizationId("org_eval_skip"),
        workspaceId: asWorkspaceId("ws_eval_skip"),
        executionId: asExecutionId(`${input.requestId}_exec`),
        capabilityId: asCapabilityId("general"),
      },
      rubric: {
        id: "unevaluated",
        name: "Unevaluated",
        version: "m95p-1",
        criteria: [],
        passingScore: 0,
      },
      judgeResults: [],
      summary: {
        overallScore: 0,
        passingScore: 0,
        passed: true,
        judgeCount: 0,
        passedJudgeCount: 0,
        failedCriteria: [],
        highlights: [input.reason],
      },
      generatedAt: now,
    },
    confidence: {
      reportId: `conf_skip_${input.requestId}`,
      evaluationReportId: `eval_skip_${input.requestId}`,
      confidenceScore: 0,
      confidenceLevel: "low",
      factors: [],
      generatedAt: now,
    },
    review: {
      decisionId: `rev_skip_${input.requestId}`,
      evaluationReportId: `eval_skip_${input.requestId}`,
      confidenceReportId: `conf_skip_${input.requestId}`,
      disposition: "skip",
      rationale: input.reason,
      triggers: [input.reason],
      decidedAt: now,
    },
    integrity,
  };
}
