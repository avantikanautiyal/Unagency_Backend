/**
 * Maps deferred integration post-processing reports → execution extras fields.
 */

import type { DirectExecutionReport } from "../../direct/contracts";
import type { EnterpriseApiExecutionMode } from "../runtime/execution-mode";
import type {
  ExecutionExperienceSummary,
  ExecutionResource,
} from "../contracts";
import { buildIntegrationJobSummary } from "../../infrastructure/execution/workers/integration-job-summary";
import { osLifecycleFromApiStatus } from "../../os";
import type { GovernanceFinalizeService } from "../../os/governance/finalize";
import {
  finalizeExecutionGovernanceExtras,
  previewFromIntegrationReport,
} from "./execution-governance-extras";

export function experienceSummaryFromIntegrationReport(
  executionId: string,
  report: DirectExecutionReport
): ExecutionExperienceSummary {
  const jobSummary = buildIntegrationJobSummary({
    report,
    executionMode: "live",
    durationMs: report.durationMs,
  });
  const experienceIds = Array.isArray(jobSummary.experienceIds)
    ? jobSummary.experienceIds.filter(
        (id): id is string => typeof id === "string" && id.trim().length > 0
      )
    : [];
  return {
    executionId,
    experienceIds,
    applied: jobSummary.experienceApplied === true || experienceIds.length > 0,
  };
}

export function evaluationFromIntegrationReport(
  executionId: string,
  report: DirectExecutionReport,
  governanceFinalize: GovernanceFinalizeService,
  input: {
    readonly organizationId: string;
    readonly capabilityId?: string;
    readonly objective?: string;
    readonly brandTone?: string;
    readonly status: ExecutionResource["status"];
    readonly nowIso: () => string;
    readonly createId: (prefix: string) => string;
  }
): {
  executionId: string;
  score: number | null;
  humanReviewRequired: boolean;
} {
  const jobSummary = buildIntegrationJobSummary({
    report,
    executionMode: "live",
    durationMs: report.durationMs,
  });
  const fallbackScore =
    typeof jobSummary.evaluationScore === "number"
      ? jobSummary.evaluationScore
      : null;
  const providerSuccess =
    input.status === "succeeded" || input.status === "awaiting_approval";
  const finalized = finalizeExecutionGovernanceExtras({
    governanceFinalize,
    organizationId: input.organizationId,
    executionId,
    capabilityId: input.capabilityId ?? "text.generate",
    objective: input.objective ?? previewFromIntegrationReport(report).slice(0, 500),
    preview: previewFromIntegrationReport(report),
    brandTone: input.brandTone,
    providerSuccess,
    fallbackEvaluationScore: fallbackScore,
    nowIso: input.nowIso,
    createId: input.createId,
  });
  return finalized.evaluation;
}

export function governanceFromIntegrationReport(
  report: DirectExecutionReport,
  status: ExecutionResource["status"],
  governanceFinalize: GovernanceFinalizeService,
  input: {
    readonly executionId: string;
    readonly organizationId: string;
    readonly capabilityId?: string;
    readonly objective?: string;
    readonly brandTone?: string;
    readonly nowIso: () => string;
    readonly createId: (prefix: string) => string;
  }
) {
  const jobSummary = buildIntegrationJobSummary({
    report,
    executionMode: "live",
    durationMs: report.durationMs,
  });
  const fallbackScore =
    typeof jobSummary.evaluationScore === "number"
      ? jobSummary.evaluationScore
      : null;
  const providerSuccess = status === "succeeded" || status === "awaiting_approval";
  return finalizeExecutionGovernanceExtras({
    governanceFinalize,
    organizationId: input.organizationId,
    executionId: input.executionId,
    capabilityId: input.capabilityId ?? "text.generate",
    objective: input.objective ?? previewFromIntegrationReport(report).slice(0, 500),
    preview: previewFromIntegrationReport(report),
    brandTone: input.brandTone,
    providerSuccess,
    fallbackEvaluationScore: fallbackScore,
    nowIso: input.nowIso,
    createId: input.createId,
  }).governance;
}

export function mergePostProcessingIntoExtras(input: {
  readonly executionId: string;
  readonly correlationId: string;
  readonly report: DirectExecutionReport;
  readonly executionMode: EnterpriseApiExecutionMode;
  readonly status: ExecutionResource["status"];
  readonly existingExtras: Readonly<Record<string, unknown>> | undefined;
  readonly nowIso: () => string;
  readonly governanceFinalize: GovernanceFinalizeService;
  readonly organizationId?: string;
  readonly capabilityId?: string;
  readonly objective?: string;
  readonly brandTone?: string;
  readonly createId?: (prefix: string) => string;
}): Readonly<Record<string, unknown>> {
  const jobSummary = buildIntegrationJobSummary({
    report: input.report,
    executionMode: input.executionMode === "live" ? "live" : "simulated",
    durationMs: input.report.durationMs,
  });
  const createId = input.createId ?? ((prefix: string) => `${prefix}_${Date.now()}`);
  const organizationId = input.organizationId ?? "unknown";
  const governanceInput = {
    executionId: input.executionId,
    organizationId,
    capabilityId: input.capabilityId,
    objective: input.objective,
    brandTone: input.brandTone,
    nowIso: input.nowIso,
    createId,
  };
  const evaluation = evaluationFromIntegrationReport(
    input.executionId,
    input.report,
    input.governanceFinalize,
    {
      ...governanceInput,
      status: input.status,
    }
  );
  const experience = experienceSummaryFromIntegrationReport(
    input.executionId,
    input.report
  );
  const governance = governanceFromIntegrationReport(
    input.report,
    input.status,
    input.governanceFinalize,
    governanceInput
  );
  const priorTrace = input.existingExtras?.trace as
    | { stages?: readonly string[]; durationMs?: number }
    | undefined;
  const traceStages = Array.isArray(priorTrace?.stages)
    ? [...priorTrace.stages]
    : [];
  if (!traceStages.includes("integration_post_processing")) {
    traceStages.push("integration_post_processing");
  }

  return {
    ...(input.existingExtras ?? {}),
    evaluation,
    experience,
    governance,
    osLifecycle: osLifecycleFromApiStatus(input.status),
    integrationPostProcessing: {
      success: input.report.success,
      stagesCompleted: input.report.stagesCompleted.length,
      postProcessingComplete: jobSummary.postProcessingComplete === true,
      evaluationPlaceholder: jobSummary.evaluationPlaceholder,
      experienceIds: experience.experienceIds,
      learningSignals: jobSummary.learningSignals,
      experiencesSaved: jobSummary.experiencesSaved,
    },
    trace: {
      executionId: input.executionId,
      correlationId: input.correlationId,
      stages: traceStages,
      durationMs:
        typeof priorTrace?.durationMs === "number"
          ? priorTrace.durationMs + input.report.durationMs
          : input.report.durationMs,
    },
  };
}
