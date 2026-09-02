/**
 * Phase 6 governance finalize → execution extras (single-capability path).
 */

import type { DirectExecutionReport } from "../../direct/contracts";
import { buildIntegrationJobSummary } from "../../infrastructure/execution/workers/integration-job-summary";
import type {
  GovernanceFinalizeService,
  GovernanceFinalizeResult,
} from "../../os/governance/finalize";
import type { OsGovernanceDecision } from "../../os/governance/governance-engine";
import type { GovernanceDecision } from "../../os/governance/types";
import type { HumanReviewRecord } from "../../os/governance/human-review";
import type { GovernancePolicy } from "../../os/governance/policy";
import { CREATIVE_SCORE_RELEASE_GATE } from "../../os/evaluation/creative-score/creative-score-dimensions";
import {
  creativeQaFromEvaluationResult,
  creativeQaExtras,
} from "../../os/evaluation/creative-score/creative-qa-gate";
import { CREATIVE_SCORE_EVALUATOR_ID } from "../../os/evaluation/evaluators/creative-score-evaluator";
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

/**
 * Prefer the requested deliverable (outputKind / structured schema) over the
 * generic capability → output.copy mapping for text.generate.
 */
export function resolveOutputContractId(
  capabilityId: string,
  options?: {
    readonly outputKind?: string;
    readonly structuredOutputName?: string;
  }
): string {
  const kind = (options?.outputKind ?? "").trim().toLowerCase();
  const name = (options?.structuredOutputName ?? "").trim().toLowerCase();
  if (
    kind === "deferred_website" ||
    kind === "website" ||
    name === "webproject" ||
    name === "websitepage"
  ) {
    return "output.website";
  }
  if (
    kind === "presentation" ||
    name === "presentationplan" ||
    name === "presentationroutes" ||
    name === "presentationrouteconcepts"
  ) {
    return "output.presentation";
  }
  if (kind === "document" || name === "documentplan") {
    return "output.document";
  }
  if (kind === "email" || name === "emailplan") {
    return "output.copy";
  }
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
  report: DirectExecutionReport
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

/** Extract Step 2 validation context from execution metadata + job summary. */
export function validationContextFromExecution(input: {
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly jobSummary?: Readonly<Record<string, unknown>>;
  readonly mediaArtifactIds?: readonly string[];
}): {
  subtype?: string;
  platform?: string;
  format?: string;
  industry?: string;
  mockupRole?: string;
  expectedAspectRatio?: string;
  actualAspectRatio?: string;
  structuredData?: unknown;
  mediaArtifactIds?: readonly string[];
} {
  const meta = input.metadata ?? {};
  const summary = input.jobSummary ?? {};
  const structuredData =
    summary.structuredData ??
    (typeof meta.structuredOutput === "object" ? meta.structuredOutput : undefined);
  return {
    subtype: typeof meta.subtype === "string" ? meta.subtype : undefined,
    platform: typeof meta.platform === "string" ? meta.platform : undefined,
    format: typeof meta.format === "string" ? meta.format : undefined,
    industry: typeof meta.industry === "string" ? meta.industry : undefined,
    mockupRole: typeof meta.mockupRole === "string" ? meta.mockupRole : undefined,
    expectedAspectRatio:
      typeof meta.aspectRatio === "string" ? meta.aspectRatio : undefined,
    actualAspectRatio:
      typeof meta.actualAspectRatio === "string"
        ? meta.actualAspectRatio
        : undefined,
    structuredData,
    mediaArtifactIds: input.mediaArtifactIds,
  };
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
  const creativeTotal = result.aggregate.aggregateScores.creativeScoreTotal;
  const creativeResult = result.aggregate.results.find(
    (r) => r.evaluatorId === CREATIVE_SCORE_EVALUATOR_ID
  );
  const gate = creativeQaFromEvaluationResult(creativeResult);
  const score =
    typeof creativeTotal === "number"
      ? creativeTotal / 100
      : result.aggregate.aggregateScores.overallScore ?? fallbackScore ?? null;
  const humanReviewRequired =
    result.signal === "PAUSE_HUMAN_REVIEW" ||
    result.decision.action === "HUMAN_REVIEW" ||
    gate?.suggestRefine === true ||
    (typeof creativeTotal === "number" &&
      creativeTotal < CREATIVE_SCORE_RELEASE_GATE);
  return {
    executionId,
    score: typeof score === "number" ? score : null,
    humanReviewRequired,
    creativeScore: creativeTotal ?? null,
    releaseBlocked: gate?.blockedRelease === true,
    weakDimensions: gate?.weakDimensions,
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
  readonly brandVoice?: string;
  readonly brandAvoidTerms?: readonly string[];
  readonly brandPreferredTerms?: readonly string[];
  readonly prohibitedPatterns?: readonly string[];
  readonly continuityBound?: boolean;
  readonly boundLogoAssetId?: string;
  readonly mediaOutputCount?: number;
  readonly isImageCapability?: boolean;
  readonly service?: string;
  readonly territory?: string;
  readonly planId?: string;
  readonly planVersion?: number;
  readonly providerSuccess: boolean;
  readonly fallbackEvaluationScore?: number | null;
  readonly productMode?: ProductMode;
  readonly outputKind?: string;
  readonly structuredOutputName?: string;
  readonly subtype?: string;
  readonly platform?: string;
  readonly format?: string;
  readonly industry?: string;
  readonly mockupRole?: string;
  readonly expectedAspectRatio?: string;
  readonly actualAspectRatio?: string;
  readonly structuredData?: unknown;
  readonly mediaArtifactIds?: readonly string[];
  readonly buildSucceeded?: boolean;
  readonly buildOutput?: string;
  readonly runtimeErrors?: readonly string[];
  readonly nowIso: () => string;
  readonly createId: (prefix: string) => string;
}): {
  governance: GovernanceDecision;
  evaluation: ExecutionEvaluationSummary;
  humanReview?: HumanReviewRecord;
  policy: GovernancePolicy;
  creativeQaExtras?: Record<string, unknown>;
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
    brandVoice: input.brandVoice,
    brandAvoidTerms: input.brandAvoidTerms,
    brandPreferredTerms: input.brandPreferredTerms,
    prohibitedPatterns: input.prohibitedPatterns,
    continuityBound: input.continuityBound,
    boundLogoAssetId: input.boundLogoAssetId,
    mediaOutputCount: input.mediaOutputCount,
    capabilityId: input.capabilityId,
    isImageCapability: input.isImageCapability,
    service: input.service,
    territory: input.territory,
    subtype: input.subtype,
    platform: input.platform,
    format: input.format,
    industry: input.industry,
    outputKind: input.outputKind,
    mockupRole: input.mockupRole,
    expectedAspectRatio: input.expectedAspectRatio,
    actualAspectRatio: input.actualAspectRatio,
    structuredData: input.structuredData,
    mediaArtifactIds: input.mediaArtifactIds,
    buildSucceeded: input.buildSucceeded,
    buildOutput: input.buildOutput,
    runtimeErrors: input.runtimeErrors,
    providerSuccess: input.providerSuccess,
    policy,
    taskResults: [
      {
        taskId: "task_primary",
        taskKey: "primary",
        preview: input.preview,
        outputContractId: resolveOutputContractId(input.capabilityId, {
          outputKind: input.outputKind,
          structuredOutputName: input.structuredOutputName,
        }),
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
    creativeQaExtras: creativeQaExtras(
      creativeQaFromEvaluationResult(
        result.aggregate.results.find(
          (r) => r.evaluatorId === CREATIVE_SCORE_EVALUATOR_ID
        )
      )
    ),
  };
}
