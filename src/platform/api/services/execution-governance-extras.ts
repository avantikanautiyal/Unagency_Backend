/**
 * Phase 6 governance finalize → execution extras (single-capability path).
 */

import type { IntelligenceOsIntegrationReport } from "../../intelligence/integration/contracts/result";
import { buildIntegrationJobSummary } from "../../infrastructure/execution/workers/integration-job-summary";
import type {
  GovernanceFinalizeService,
  GovernanceFinalizeResult,
} from "../../os/governance/finalize";
import type { OsGovernanceDecision } from "../../os/governance/governance-engine";
import type { GovernanceDecision } from "../../os/governance/types";
import type { HumanReviewRecord } from "../../os/governance/human-review";
import type { GovernancePolicy } from "../../os/governance/policy";
import { createGovernancePolicyForProductMode } from "../../os/governance/governance-policy-by-product-mode";
import type { ProductMode } from "../../os/contracts/product-mode";
import type { ExecutionEvaluationSummary } from "../contracts";

const CAPABILITY_TO_OUTPUT_CONTRACT: Readonly<Record<string, string>> = {
  "text.generate": "output.copy",
  "image.generate": "output.image",
  "video.generate": "output.video",
  "reasoning.analyze": "output.analysis",
  "research.search": "output.research_report",
};

export function resolveOutputContractId(capabilityId: string): string {
  const trimmed = capabilityId.trim();
  if (trimmed.startsWith("output.")) return trimmed;
  return CAPABILITY_TO_OUTPUT_CONTRACT[trimmed] ?? trimmed;
}

export function previewFromJobSummary(
  jobSummary: Readonly<Record<string, unknown>>
): string {
  if (typeof jobSummary.resultText === "string" && jobSummary.resultText.trim()) {
    return jobSummary.resultText.slice(0, 8_000);
  }
  const structured = jobSummary.structuredData;
  if (typeof structured === "string" && structured.trim()) {
    return structured.slice(0, 8_000);
  }
  if (structured != null) {
    try {
      return JSON.stringify(structured).slice(0, 8_000);
    } catch {
      return "[structured output]";
    }
  }
  return "[execution output]";
}

export function previewFromIntegrationReport(
  report: IntelligenceOsIntegrationReport
): string {
  const jobSummary = buildIntegrationJobSummary({
    report,
    executionMode: "live",
    durationMs: report.durationMs,
  });
  const fromSummary = previewFromJobSummary(jobSummary);
  if (fromSummary !== "[execution output]") return fromSummary;
  const output = report.artifacts.runtime?.response?.output as
    | Readonly<Record<string, unknown>>
    | undefined;
  if (output && typeof output.content === "string" && output.content.trim()) {
    return output.content.slice(0, 8_000);
  }
  return fromSummary;
}

export function osGovernanceDecisionToExtras(
  decision: OsGovernanceDecision
): GovernanceDecision {
  return {
    action: decision.legacyAction,
    checks: decision.checks,
    blocking: decision.blocking,
    reason: decision.reason,
    decidedAt: decision.decidedAt,
  };
}

export function evaluationSummaryFromFinalize(
  executionId: string,
  result: GovernanceFinalizeResult,
  fallbackScore?: number | null
): ExecutionEvaluationSummary {
  const score =
    result.aggregate.aggregateScores.overallScore ?? fallbackScore ?? null;
  const humanReviewRequired =
    result.signal === "PAUSE_HUMAN_REVIEW" ||
    result.decision.action === "HUMAN_REVIEW" ||
    (typeof score === "number" && score < 0.7);
  return {
    executionId,
    score: typeof score === "number" ? score : null,
    humanReviewRequired,
  };
}

export function finalizeExecutionGovernanceExtras(input: {
  readonly governanceFinalize: GovernanceFinalizeService;
  readonly organizationId: string;
  readonly executionId: string;
  readonly capabilityId: string;
  readonly objective: string;
  readonly preview: string;
  readonly brandTone?: string;
  readonly planId?: string;
  readonly planVersion?: number;
  readonly providerSuccess: boolean;
  readonly fallbackEvaluationScore?: number | null;
  readonly productMode?: ProductMode;
  readonly nowIso: () => string;
  readonly createId: (prefix: string) => string;
}): {
  governance: GovernanceDecision;
  evaluation: ExecutionEvaluationSummary;
  humanReview?: HumanReviewRecord;
  policy: GovernancePolicy;
} {
  const policy = createGovernancePolicyForProductMode({
    organizationId: input.organizationId,
    productMode: input.productMode,
    nowIso: input.nowIso,
  });
  const result = input.governanceFinalize.finalizeExecution({
    organizationId: input.organizationId,
    executionId: input.executionId,
    planId: input.planId ?? `plan_${input.executionId}`,
    planVersion: input.planVersion ?? 1,
    objective: input.objective,
    brandTone: input.brandTone,
    providerSuccess: input.providerSuccess,
    policy,
    taskResults: [
      {
        taskId: "task_primary",
        taskKey: "primary",
        preview: input.preview,
        outputContractId: resolveOutputContractId(input.capabilityId),
      },
    ],
    nowIso: input.nowIso,
    createId: input.createId,
  });
  return {
    governance: osGovernanceDecisionToExtras(result.decision),
    evaluation: evaluationSummaryFromFinalize(
      input.executionId,
      result,
      input.fallbackEvaluationScore
    ),
    humanReview: result.humanReview,
    policy,
  };
}
