/**
 * Step 10 — Production evidence ingestion + shadow decision orchestration.
 * Non-blocking, append-only, never modifies production routing.
 */

import type { IBenchmarkPerformanceRecordStore } from "../persistence/benchmark-record-store";
import { defaultBenchmarkPerformanceRecordStore } from "../persistence/benchmark-record-store";
import {
  buildProductionPerformanceRecord,
  type ProductionEvidenceInput,
} from "./production-record-builder";
import { resolveShadowDecision } from "../shadow/shadow-decision-service";
import type { IShadowDecisionStore } from "../shadow/shadow-decision-store";
import { defaultShadowDecisionStore } from "../shadow/shadow-decision-store";
import type { ShadowDecision, ShadowDecisionContext } from "../shadow/shadow-decision-contract";
import type { ModelPerformanceRecord } from "../contracts/model-performance-record";
import {
  logProductionEvidenceFailure,
  logProductionEvidenceRecorded,
} from "../shadow/shadow-logger";
import { knowledgeVersionTag } from "../experiment/contracts/knowledge-context";
import { getKnowledgeContext } from "../experiment/catalog/knowledge-catalog";
import { recordProductionEvidenceTrace, getExecutionTrace, recordExecutionTraceStage } from "../../../../../os/observability/execution-trace";
import {
  requirementComplianceObservabilitySummary,
} from "../../../../../collaboration/conversational-task-intelligence/execution-spec-snapshot";
import {
  buildProductionExecutionIntegrity,
  logProductionExecutionIntegrity,
  mergeProviderIdentityFromTrace,
  resolveActualProviderIdentity,
} from "../../../../../os/observability/production-execution-integrity";
import {
  resolveProductionValidationAsync,
  type ProductionArtifactEvaluationDeps,
  type ProductionEvaluationStageTrace,
} from "./production-validation-resolver";
import { schedulePersistExecutionObservability } from "../../../../../os/observability/persist-execution-observability";
import type { IExecutionObservabilityStore } from "../../../../../os/observability/execution-observability-store";
import type { CanonicalExecutionSpecification } from "../../../../../collaboration/conversational-task-intelligence/execution-specification";
import type { DeliverableFormat } from "../../../../../collaboration/conversational-task-intelligence/execution-specification";
import type { ExecutionSpecSnapshot } from "../../../../../collaboration/conversational-task-intelligence/execution-spec-snapshot";
import type { DeliverableComplianceReport } from "../../../../../collaboration/conversational-task-intelligence/deliverable-compliance";

export type ProductionExecutionEvidenceContext = {
  readonly organizationId: string;
  readonly productionExecutionId: string;
  readonly requestId?: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly modelVersion?: string;
  readonly capabilityId: string;
  readonly service: string;
  readonly subtype: string;
  readonly outputKind: string;
  readonly industry?: string;
  readonly platform?: string;
  readonly format?: string;
  readonly preview: string;
  readonly briefObjective?: string;
  readonly strategyId?: string;
  readonly strategyVersion?: string;
  readonly knowledgeId?: string;
  readonly knowledgeVersion?: string;
  readonly knowledgeFingerprint?: string;
  readonly latencyMs: number;
  readonly modelLatencyMs?: number;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly totalTokens?: number;
  readonly estimatedCost?: number | null;
  readonly providerSuccess: boolean;
  readonly structuredData?: unknown;
  readonly mediaArtifactIds?: readonly string[];
  /** P4.6.1 — canonical execution specification snapshot (authoritative). */
  readonly executionSpec?: CanonicalExecutionSpecification;
  readonly executionSpecSnapshot?: ExecutionSpecSnapshot;
  readonly presentDeliverableFormats?: readonly DeliverableFormat[];
  readonly generatedQuantity?: number;
  readonly generatedWidth?: number;
  readonly generatedHeight?: number;
  readonly generatedPageCount?: number;
  readonly previewContainsCta?: boolean;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly routingMode?: "static" | "adaptive";
  readonly routingPolicyId?: string;
  readonly routingPolicyVersion?: string;
  readonly adaptiveDecisionId?: string;
  readonly adaptiveSelected?: boolean;
  readonly adaptiveExecutionSucceeded?: boolean;
  readonly fallbackUsed?: boolean;
  readonly fallbackReason?: string;
  readonly createId: (prefix: string) => string;
  readonly nowIso: () => string;
};

export type ProductionEvidenceResult = {
  readonly evidenceRecorded: boolean;
  readonly performanceRecord?: ModelPerformanceRecord;
  readonly shadowDecision?: ShadowDecision;
  readonly evidenceError?: string;
  readonly shadowError?: string;
};

export type ProductionEvidenceServiceDeps = {
  readonly recordStore?: IBenchmarkPerformanceRecordStore;
  readonly shadowStore?: IShadowDecisionStore;
  readonly observabilityStore?: IExecutionObservabilityStore;
  readonly env?: NodeJS.ProcessEnv;
  readonly artifactEvaluationDeps?: ProductionArtifactEvaluationDeps;
};

function resolveProductionKnowledge(input: ProductionExecutionEvidenceContext): {
  knowledgeId?: string;
  knowledgeVersion?: string;
  knowledgeFingerprint?: string;
} {
  if (input.knowledgeId) {
    const ctx = getKnowledgeContext(input.knowledgeId);
    return Object.freeze({
      knowledgeId: input.knowledgeId,
      knowledgeVersion: input.knowledgeVersion ?? (ctx ? knowledgeVersionTag(ctx) : undefined),
      knowledgeFingerprint: input.knowledgeFingerprint ?? ctx?.contentFingerprint,
    });
  }
  if (input.industry) {
    const industryKnowledge = getKnowledgeContext(`knowledge.${input.industry}`);
    if (industryKnowledge) {
      return Object.freeze({
        knowledgeId: industryKnowledge.knowledgeId,
        knowledgeVersion: knowledgeVersionTag(industryKnowledge),
        knowledgeFingerprint: industryKnowledge.contentFingerprint,
      });
    }
  }
  const generic = getKnowledgeContext("knowledge.generic");
  return Object.freeze({
    knowledgeId: generic?.knowledgeId ?? "knowledge.generic",
    knowledgeVersion: generic ? knowledgeVersionTag(generic) : "knowledge.generic@1.0.0",
    knowledgeFingerprint: generic?.contentFingerprint,
  });
}

export async function ingestProductionEvidenceAndShadow(
  context: ProductionExecutionEvidenceContext,
  deps?: ProductionEvidenceServiceDeps,
): Promise<ProductionEvidenceResult> {
  const recordStore = deps?.recordStore ?? defaultBenchmarkPerformanceRecordStore;
  const shadowStore = deps?.shadowStore ?? defaultShadowDecisionStore;

  let performanceRecord: ModelPerformanceRecord | undefined;
  let shadowDecision: ShadowDecision | undefined;
  let evidenceError: string | undefined;
  let shadowError: string | undefined;
  let stageTrace: ProductionEvaluationStageTrace | undefined;
  let validation: import("../../../../../os/evaluation/output-validation/validation-result").OutputValidationResult | null =
    null;
  let deliverableCompliance: DeliverableComplianceReport | undefined;
  let requirementComplianceAvailable = false;

  try {
    const resolved = await resolveProductionValidationAsync({
      context,
      artifactEvaluationDeps: deps?.artifactEvaluationDeps,
      createId: context.createId,
      nowIso: context.nowIso,
    });
    validation = resolved.validation;
    stageTrace = resolved.stageTrace;
    deliverableCompliance = resolved.deliverableCompliance;
    requirementComplianceAvailable = resolved.requirementComplianceAvailable;

    if (!validation) {
      evidenceError = "Step 2 validation unavailable for production context";
      logProductionEvidenceFailure({
        productionExecutionId: context.productionExecutionId,
        stage: "validation",
        message: evidenceError,
      });
    } else {
      const knowledge = resolveProductionKnowledge(context);
      const recordInput: ProductionEvidenceInput = {
        organizationId: context.organizationId,
        productionExecutionId: context.productionExecutionId,
        requestId: context.requestId,
        providerId: context.providerId,
        modelId: context.modelId,
        modelVersion: context.modelVersion,
        capabilityId: context.capabilityId,
        service: context.service,
        subtype: context.subtype,
        outputKind: context.outputKind,
        industry: context.industry,
        platform: context.platform,
        format: context.format,
        strategyId: context.strategyId ?? "strategy.baseline",
        strategyVersion: context.strategyVersion ?? "1.0.0",
        ...knowledge,
        validation,
        preview: context.preview,
        mediaArtifactIds: context.mediaArtifactIds,
        latencyMs: context.latencyMs,
        modelLatencyMs: context.modelLatencyMs,
        inputTokens: context.inputTokens,
        outputTokens: context.outputTokens,
        totalTokens: context.totalTokens,
        estimatedCost: context.estimatedCost,
        providerSuccess: context.providerSuccess,
        routingMode: context.routingMode,
        routingPolicyId: context.routingPolicyId,
        routingPolicyVersion: context.routingPolicyVersion,
        adaptiveDecisionId: context.adaptiveDecisionId,
        adaptiveSelected: context.adaptiveSelected,
        adaptiveExecutionSucceeded: context.adaptiveExecutionSucceeded,
        fallbackUsed: context.fallbackUsed,
        createId: context.createId,
        nowIso: context.nowIso,
      };
      performanceRecord = buildProductionPerformanceRecord(recordInput);
      await recordStore.append(performanceRecord);

      logProductionEvidenceRecorded({
        productionExecutionId: context.productionExecutionId,
        requestId: context.requestId,
        service: context.service,
        subtype: context.subtype,
        industry: context.industry,
        providerId: context.providerId,
        modelId: context.modelId,
        strategyId: recordInput.strategyId,
        knowledgeId: recordInput.knowledgeId,
        qualityScore: performanceRecord.qualityScore,
        validationStatus: performanceRecord.validationStatus,
        evidenceSource: performanceRecord.evidenceSource,
        evidenceMode: performanceRecord.evidenceMode,
      });
    }
  } catch (err) {
    evidenceError = err instanceof Error ? err.message : String(err);
    logProductionEvidenceFailure({
      productionExecutionId: context.productionExecutionId,
      stage: "evidence",
      message: evidenceError,
    });
  }

  try {
    const knowledge = resolveProductionKnowledge(context);
    const shadowContext: ShadowDecisionContext = {
      productionExecutionId: context.productionExecutionId,
      requestId: context.requestId,
      organizationId: context.organizationId,
      service: context.service,
      subtype: context.subtype,
      outputKind: context.outputKind,
      industry: context.industry,
      capabilityId: context.capabilityId,
      actual: Object.freeze({
        providerId: context.providerId,
        modelId: context.modelId,
        strategyId: context.strategyId ?? "strategy.baseline",
        strategyVersion: context.strategyVersion ?? "1.0.0",
        ...knowledge,
      }),
      actualQualityScore: performanceRecord?.qualityScore,
    };

    shadowDecision = await resolveShadowDecision(shadowContext, {
      recordStore,
      createId: context.createId,
      nowIso: context.nowIso,
      env: deps?.env,
    });
    await shadowStore.append(shadowDecision);
  } catch (err) {
    shadowError = err instanceof Error ? err.message : String(err);
    logProductionEvidenceFailure({
      productionExecutionId: context.productionExecutionId,
      stage: "shadow",
      message: shadowError,
    });
  }

  const traceBeforeFinalize = getExecutionTrace(context.productionExecutionId);
  const providerIdentity = mergeProviderIdentityFromTrace(
    traceBeforeFinalize,
    resolveActualProviderIdentity({
      actualProviderId: context.providerId,
      actualModelId: context.modelId,
      selectedProviderId: traceBeforeFinalize?.selectedProviderId,
      selectedModelId: traceBeforeFinalize?.selectedModelId,
      requestedProviderId: traceBeforeFinalize?.requestedProviderId,
      requestedModelId: traceBeforeFinalize?.requestedModelId,
      fallbackUsed: context.fallbackUsed,
      fallbackReason: context.fallbackReason,
    }),
  );
  const integrity = buildProductionExecutionIntegrity({
    executionId: context.productionExecutionId,
    correlationId: context.requestId ?? context.productionExecutionId,
    service: context.service,
    subtype: context.subtype,
    outputKind: context.outputKind,
    capabilityId: context.capabilityId,
    providerIdentity,
    trace: traceBeforeFinalize,
    structuredOutputRequested: traceBeforeFinalize?.usedStructuredOutput,
    structuredDataPresent: context.structuredData != null,
    mediaArtifactIds: context.mediaArtifactIds,
    performanceRecordId: performanceRecord?.performanceRecordId,
    evidenceRecorded: performanceRecord != null,
    validationExecuted: validation != null,
    evaluationPlaneExecuted: stageTrace?.evaluationPlane === "COMPLETED",
    artifactHydrated: stageTrace?.artifactHydration === "COMPLETED",
    artifactEvaluated: stageTrace?.evaluationPlane === "COMPLETED",
  });

  const finalizedTrace = recordProductionEvidenceTrace({
    executionId: context.productionExecutionId,
    contractValidationStatus: performanceRecord?.validationStatus,
    evaluationStatus: performanceRecord?.validationStatus,
    qualityScore: performanceRecord?.qualityScore,
    evidenceSource: performanceRecord?.evidenceSource,
    evidenceMode: performanceRecord?.evidenceMode,
    performanceRecordId: performanceRecord?.performanceRecordId,
    finalOutcome: performanceRecord?.benchmarkOutcome,
    providerSuccess: context.providerSuccess,
    step2SkippedReason: evidenceError ? evidenceError : undefined,
    step2Executed: validation != null,
    evidenceRecorded: performanceRecord != null,
    stageTrace,
  });
  if (requirementComplianceAvailable) {
    recordExecutionTraceStage({
      executionId: context.productionExecutionId,
      stage: "step2_validation",
      status:
        deliverableCompliance?.overallStatus === "DELIVERABLE_COMPLIANCE_FAILURE"
          ? "FAILED"
          : deliverableCompliance
            ? "COMPLETED"
            : "SKIPPED",
      details: requirementComplianceObservabilitySummary(deliverableCompliance),
      skipReason: deliverableCompliance ? undefined : "deliverable_compliance_unavailable",
    });
  } else if (context.executionSpecSnapshot || context.executionSpec) {
    recordExecutionTraceStage({
      executionId: context.productionExecutionId,
      stage: "step2_validation",
      status: "SKIPPED",
      skipReason: "requirement_compliance_unavailable",
    });
  }
  const finalIntegrity = finalizedTrace
    ? buildProductionExecutionIntegrity({
        executionId: context.productionExecutionId,
        correlationId: context.requestId ?? context.productionExecutionId,
        service: context.service,
        subtype: context.subtype,
        outputKind: context.outputKind,
        capabilityId: context.capabilityId,
        providerIdentity,
        trace: finalizedTrace,
        structuredOutputRequested: finalizedTrace.usedStructuredOutput,
        structuredDataPresent: context.structuredData != null,
        mediaArtifactIds: context.mediaArtifactIds,
        performanceRecordId: performanceRecord?.performanceRecordId,
        evidenceRecorded: performanceRecord != null,
        validationExecuted: validation != null,
        evaluationPlaneExecuted: stageTrace?.evaluationPlane === "COMPLETED",
        artifactHydrated: stageTrace?.artifactHydration === "COMPLETED",
        artifactEvaluated: stageTrace?.evaluationPlane === "COMPLETED",
      })
    : integrity;
  logProductionExecutionIntegrity(finalIntegrity);

  if (finalizedTrace) {
    schedulePersistExecutionObservability(
      {
        organizationId: context.organizationId,
        trace: finalizedTrace,
        integrity: finalIntegrity,
        latencyMs: context.latencyMs,
        evaluationPlaneVersion: performanceRecord?.evaluationPlaneVersion,
        evidenceSource: performanceRecord?.evidenceSource,
        evidenceMode: performanceRecord?.evidenceMode,
        performanceRecordId: performanceRecord?.performanceRecordId,
        contractValidationStatus: performanceRecord?.validationStatus,
        qualityScore: performanceRecord?.qualityScore,
        finalOutcome: performanceRecord?.benchmarkOutcome,
        executionStatus: finalizedTrace.executionStatus,
      },
      deps?.observabilityStore,
    );
  }

  return Object.freeze({
    evidenceRecorded: performanceRecord != null,
    ...(performanceRecord ? { performanceRecord } : {}),
    ...(shadowDecision ? { shadowDecision } : {}),
    ...(evidenceError ? { evidenceError } : {}),
    ...(shadowError ? { shadowError } : {}),
  });
}

export function createProductionEvidenceService(deps?: ProductionEvidenceServiceDeps) {
  return Object.freeze({
    ingestProductionEvidenceAndShadow: (context: ProductionExecutionEvidenceContext) =>
      ingestProductionEvidenceAndShadow(context, deps),
  });
}

/** Fire-and-forget wrapper — production delivery must never depend on this. */
export function scheduleProductionEvidenceAndShadow(
  context: ProductionExecutionEvidenceContext,
  deps?: ProductionEvidenceServiceDeps,
): void {
  void ingestProductionEvidenceAndShadow(context, deps).catch((err) => {
    logProductionEvidenceFailure({
      productionExecutionId: context.productionExecutionId,
      stage: "async",
      message: err instanceof Error ? err.message : String(err),
    });
  });
}
