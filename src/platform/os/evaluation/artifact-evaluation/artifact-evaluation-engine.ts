/**
 * Step 6 / 14B — Orchestrates automated artifact evaluation before Step 2 validation.
 * Delegates to the generalized Evaluation Plane (backward compatible).
 */

import type { ValidateOutputContractInput } from "../output-validation/output-contract-validation-engine";
import { runEvaluationPlane } from "../evaluation-plane/evaluation-plane";
import type {
  ArtifactEvaluationEnrichment,
  ArtifactEvaluationInput,
} from "./types";

export async function runArtifactEvaluation(
  input: ArtifactEvaluationInput,
): Promise<ArtifactEvaluationEnrichment> {
  const { enrichment } = await runEvaluationPlane({
    executionId: input.executionId,
    organizationId: input.organizationId,
    outputKind: input.outputKind,
    service: input.service,
    subtype: input.subtype,
    preview: input.preview,
    structuredOutput: input.structuredData,
    mediaArtifactIds: input.mediaArtifactIds,
    buildSucceeded: input.buildSucceeded,
    buildOutput: input.buildOutput,
    briefObjective: input.briefObjective,
    brandColors: input.brandColors,
    brandPreferredTerms: input.brandPreferredTerms,
    brandAvoidTerms: input.brandAvoidTerms,
    nowIso: input.nowIso,
    hydrateArtifacts: input.hydrateArtifacts,
    runRuntimeCheck: input.runRuntimeCheck,
  });

  return enrichment;
}

export function mergeArtifactEvaluationIntoValidationInput(input: {
  readonly base: ValidateOutputContractInput;
  readonly enrichment: ArtifactEvaluationEnrichment;
}): ValidateOutputContractInput {
  return Object.freeze({
    ...input.base,
    preview: input.enrichment.preview ?? input.base.preview,
    artifactRefs:
      input.enrichment.artifactRefs.length > 0
        ? input.enrichment.artifactRefs
        : input.base.artifactRefs,
    buildSucceeded: input.enrichment.buildSucceeded ?? input.base.buildSucceeded,
    buildOutput: input.enrichment.buildOutput ?? input.base.buildOutput,
    runtimeErrors: input.enrichment.runtimeErrors ?? input.base.runtimeErrors,
    actualAspectRatio: input.enrichment.actualAspectRatio ?? input.base.actualAspectRatio,
    artifactEvaluation: input.enrichment.artifactEvaluation,
  });
}
