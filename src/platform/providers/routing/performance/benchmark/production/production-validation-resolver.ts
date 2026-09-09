/**
 * Step 14A.1 / 14B — Production validation via shared Evaluation Plane + Step 2 path.
 * Reuses benchmark artifact evaluation infrastructure without duplicating components.
 */

import {
  validateOutputContract,
  type ValidateOutputContractInput,
} from "../../../../../os/evaluation/output-validation/output-contract-validation-engine";
import type { OutputValidationResult } from "../../../../../os/evaluation/output-validation/validation-result";
import {
  createArtifactHydrator,
  mergeArtifactEvaluationIntoValidationInput,
  runArtifactEvaluation,
} from "../../../../../os/evaluation/artifact-evaluation";
import { resolveRuntimeEvaluationDeps } from "../../../../../os/evaluation/runtime/runtime-evaluation-deps";
import type { BenchmarkArtifactEvaluationDeps } from "../engine/benchmark-validation-resolver";
import type { ProductionExecutionEvidenceContext } from "./production-evidence-service";
import type { CanonicalExecutionSpecification } from "../../../../../collaboration/conversational-task-intelligence/execution-specification";
import type { DeliverableFormat } from "../../../../../collaboration/conversational-task-intelligence/execution-specification";
import {
  evaluateDeliverableCompliance,
  type DeliverableComplianceReport,
} from "../../../../../collaboration/conversational-task-intelligence/deliverable-compliance";
import type { ExecutionSpecSnapshot } from "../../../../../collaboration/conversational-task-intelligence/execution-spec-snapshot";

export type ProductionArtifactEvaluationDeps = BenchmarkArtifactEvaluationDeps;

export type ProductionEvaluationStageTrace = {
  readonly artifactHydration: "COMPLETED" | "SKIPPED" | "FAILED";
  readonly artifactHydrationReason?: string;
  readonly artifactRender: "COMPLETED" | "SKIPPED" | "FAILED";
  readonly artifactRenderReason?: string;
  readonly runtimeEvaluation: "COMPLETED" | "SKIPPED" | "FAILED";
  readonly runtimeEvaluationReason?: string;
  readonly evaluationPlane: "COMPLETED" | "SKIPPED" | "FAILED";
  readonly evaluationPlaneReason?: string;
  readonly hydratedArtifactCount: number;
  readonly evaluationPlaneError?: string;
};

export type ProductionValidationOutcome = {
  readonly validation: OutputValidationResult | null;
  readonly stageTrace: ProductionEvaluationStageTrace;
  readonly deliverableCompliance?: DeliverableComplianceReport;
  readonly requirementComplianceAvailable: boolean;
};

function buildProductionValidationInput(
  context: ProductionExecutionEvidenceContext,
  input?: { readonly createId?: (prefix: string) => string; readonly nowIso?: () => string },
): ValidateOutputContractInput {
  return Object.freeze({
    organizationId: context.organizationId,
    executionId: context.productionExecutionId,
    service: context.service,
    subtype: context.subtype,
    outputKind: context.outputKind,
    preview: context.preview,
    briefObjective: context.briefObjective,
    industry: context.industry,
    platform: context.platform,
    format: context.format,
    structuredData: context.structuredData,
    mediaArtifactIds: context.mediaArtifactIds,
    executionSpec: context.executionSpec,
    createId: input?.createId ?? context.createId,
    nowIso: input?.nowIso ?? context.nowIso,
  });
}

function skippedStageTrace(
  reason: string,
  overrides?: Partial<ProductionEvaluationStageTrace>,
): ProductionEvaluationStageTrace {
  return Object.freeze({
    artifactHydration: "SKIPPED",
    artifactHydrationReason: reason,
    artifactRender: "SKIPPED",
    artifactRenderReason: reason,
    runtimeEvaluation: "SKIPPED",
    runtimeEvaluationReason: reason,
    evaluationPlane: "SKIPPED",
    evaluationPlaneReason: reason,
    hydratedArtifactCount: 0,
    ...overrides,
  });
}

function stageTraceFromEnrichment(input: {
  readonly hydratedCount: number;
  readonly hydrationStatus: "COMPLETED" | "SKIPPED" | "FAILED";
  readonly hydrationReason?: string;
  readonly planeStageTrace?: {
    readonly artifactRender: "COMPLETED" | "SKIPPED" | "FAILED";
    readonly artifactRenderReason?: string;
    readonly runtimeEvaluation: "COMPLETED" | "SKIPPED" | "FAILED";
    readonly runtimeEvaluationReason?: string;
  };
  readonly planeFailed?: boolean;
  readonly planeExecuted?: boolean;
  readonly planeError?: string;
}): ProductionEvaluationStageTrace {
  const planeExecuted = input.planeExecuted === true;
  return Object.freeze({
    artifactHydration: input.hydrationStatus,
    artifactHydrationReason: input.hydrationReason,
    artifactRender:
      input.planeStageTrace?.artifactRender ??
      (planeExecuted ? "COMPLETED" : "SKIPPED"),
    artifactRenderReason:
      input.planeStageTrace?.artifactRenderReason ??
      (planeExecuted ? undefined : "evaluation_plane_not_executed"),
    runtimeEvaluation: input.planeStageTrace?.runtimeEvaluation ?? "SKIPPED",
    runtimeEvaluationReason: input.planeStageTrace?.runtimeEvaluationReason,
    evaluationPlane: input.planeFailed
      ? "FAILED"
      : planeExecuted
        ? "COMPLETED"
        : "SKIPPED",
    evaluationPlaneReason: input.planeError ?? (planeExecuted ? undefined : input.hydrationReason),
    hydratedArtifactCount: input.hydratedCount,
    evaluationPlaneError: input.planeError,
  });
}

export async function resolveProductionValidationAsync(input: {
  readonly context: ProductionExecutionEvidenceContext;
  readonly artifactEvaluationDeps?: ProductionArtifactEvaluationDeps;
  readonly createId?: (prefix: string) => string;
  readonly nowIso?: () => string;
}): Promise<ProductionValidationOutcome> {
  const { context } = input;
  const hasArtifacts = (context.mediaArtifactIds?.length ?? 0) > 0;
  let validationInput = buildProductionValidationInput(context, input);
  let stageTrace: ProductionEvaluationStageTrace = skippedStageTrace("no_media_artifact_ids");

  if (hasArtifacts) {
    if (!input.artifactEvaluationDeps) {
      stageTrace = skippedStageTrace("artifact_evaluation_deps_unavailable");
    } else {
      try {
        const hydrate = createArtifactHydrator({
          artifactsRepo: input.artifactEvaluationDeps.artifactsRepo,
          blobStorage: input.artifactEvaluationDeps.asyncMedia.blobStorage,
          organizationId: context.organizationId,
        });
        const hydrated = await hydrate(context.mediaArtifactIds!);
        const runtimeDeps = resolveRuntimeEvaluationDeps({
          runRuntimeCheck: input.artifactEvaluationDeps.runRuntimeCheck,
        });
        const enrichment = await runArtifactEvaluation({
          organizationId: context.organizationId,
          executionId: context.productionExecutionId,
          outputKind: context.outputKind,
          service: context.service,
          subtype: context.subtype,
          preview: context.preview,
          structuredData: context.structuredData,
          mediaArtifactIds: context.mediaArtifactIds,
          briefObjective: context.briefObjective,
          hydrateArtifacts: hydrate,
          runRuntimeCheck: runtimeDeps.runRuntimeCheck,
          nowIso: input.nowIso ?? context.nowIso,
        });
        validationInput = mergeArtifactEvaluationIntoValidationInput({
          base: validationInput,
          enrichment,
        });
        const hydratedCount =
          enrichment.evaluationPlaneResult?.hydratedArtifactCount ??
          enrichment.artifactRefs.length ??
          hydrated.length;
        stageTrace = stageTraceFromEnrichment({
          hydratedCount,
          hydrationStatus: hydratedCount > 0 ? "COMPLETED" : "FAILED",
          hydrationReason: hydratedCount > 0 ? undefined : "hydration_returned_no_artifacts",
          planeStageTrace: enrichment.evaluationPlaneResult?.stageTrace,
          planeExecuted: Boolean(enrichment.evaluationPlaneResult),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        stageTrace = Object.freeze({
          artifactHydration: "FAILED",
          artifactHydrationReason: message,
          artifactRender: "FAILED",
          artifactRenderReason: message,
          runtimeEvaluation: "FAILED",
          runtimeEvaluationReason: message,
          evaluationPlane: "FAILED",
          evaluationPlaneReason: message,
          hydratedArtifactCount: 0,
          evaluationPlaneError: message,
        });
      }
    }
  }

  const validation = validateOutputContract(validationInput);

  let deliverableCompliance: DeliverableComplianceReport | undefined;
  if (context.executionSpec) {
    const attachedBrandAssetIds = (() => {
      const raw = context.metadata?.assetIds;
      if (Array.isArray(raw)) {
        return raw.map(String).map((s) => s.trim()).filter(Boolean);
      }
      const logo =
        typeof context.metadata?.brandLogoAssetId === "string"
          ? context.metadata.brandLogoAssetId.trim()
          : typeof context.metadata?.logoAssetId === "string"
            ? context.metadata.logoAssetId.trim()
            : "";
      return logo ? [logo] : [];
    })();
    deliverableCompliance = evaluateDeliverableCompliance({
      spec: context.executionSpec,
      presentFormats: context.presentDeliverableFormats,
      generatedQuantity: context.generatedQuantity,
      generatedWidth: context.generatedWidth,
      generatedHeight: context.generatedHeight,
      generatedPageCount: context.generatedPageCount,
      previewContainsCta: context.previewContainsCta,
      attachedBrandAssetIds,
      production: {
        platform: context.platform,
        formatId: context.format,
      },
    });
  }

  return Object.freeze({
    validation,
    stageTrace,
    deliverableCompliance,
    requirementComplianceAvailable: Boolean(context.executionSpec),
  });
}
