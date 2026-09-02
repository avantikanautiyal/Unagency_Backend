/**
 * Resolve Step 2 validation for benchmark execution with explicit outcomes.
 */

import { defaultServiceOutputContractRegistry } from "../../../../../os/contracts/output-contracts/service-contract-registry";
import {
  validateOutputContract,
  type ValidateOutputContractInput,
} from "../../../../../os/evaluation/output-validation/output-contract-validation-engine";
import type { OutputValidationResult } from "../../../../../os/evaluation/output-validation/validation-result";
import type { BenchmarkCase } from "../contracts/benchmark-case";
import type { BenchmarkExecutionOutput } from "./record-builder";
import type { AsyncMediaPlatform } from "../../../../../infrastructure/durability/create-async-media-platform";
import type { IArtifactRepository } from "../../../../../infrastructure/durability/interfaces/execution-store-ports";
import {
  createArtifactHydrator,
  mergeArtifactEvaluationIntoValidationInput,
  runArtifactEvaluation,
} from "../../../../../os/evaluation/artifact-evaluation";
import { resolveRuntimeEvaluationDeps } from "../../../../../os/evaluation/runtime/runtime-evaluation-deps";

export type BenchmarkArtifactEvaluationDeps = {
  readonly asyncMedia: AsyncMediaPlatform;
  readonly artifactsRepo: IArtifactRepository;
  readonly runRuntimeCheck?: import("../../../../../os/evaluation/artifact-evaluation/types").ArtifactEvaluationInput["runRuntimeCheck"];
};

export type BenchmarkValidationUnavailableReason =
  | "missing_service_subtype"
  | "contract_not_composable";

export type BenchmarkValidationOutcome =
  | {
      readonly kind: "validated";
      readonly validation: OutputValidationResult;
    }
  | {
      readonly kind: "validation_unavailable";
      readonly reason: BenchmarkValidationUnavailableReason;
      readonly contractId: string;
      readonly contractVersion: string;
      readonly effectiveContractId?: string;
    };

export function buildBenchmarkValidationInput(input: {
  readonly benchmarkCase: BenchmarkCase;
  readonly executionOutput: BenchmarkExecutionOutput;
  readonly organizationId: string;
  readonly executionId: string;
  readonly createId?: (prefix: string) => string;
  readonly nowIso?: () => string;
}): ValidateOutputContractInput {
  const { benchmarkCase: bc, executionOutput } = input;
  return {
    organizationId: input.organizationId,
    executionId: input.executionId,
    service: bc.service,
    subtype: bc.subtype,
    platform: bc.platform,
    format: bc.format,
    industry: bc.industry,
    outputKind: bc.outputKind,
    preview: executionOutput.preview,
    briefObjective: bc.inputBrief,
    structuredData: executionOutput.structuredData,
    mediaArtifactIds: executionOutput.mediaArtifactIds,
    buildSucceeded: executionOutput.buildSucceeded,
    createId: input.createId,
    nowIso: input.nowIso,
  };
}

export function contractReferenceForBenchmark(benchmarkCase: BenchmarkCase): {
  readonly contractId: string;
  readonly contractVersion: string;
  readonly effectiveContractId?: string;
} {
  const effective = defaultServiceOutputContractRegistry.composeEffectiveContract({
    service: benchmarkCase.service,
    subtype: benchmarkCase.subtype,
    platform: benchmarkCase.platform,
    format: benchmarkCase.format,
    industry: benchmarkCase.industry,
  });
  if (effective) {
    return Object.freeze({
      contractId: effective.contractId,
      contractVersion: effective.version,
      effectiveContractId: effective.identity.effectiveContractId,
    });
  }

  const contract = defaultServiceOutputContractRegistry.getServiceContract(
    benchmarkCase.service,
    benchmarkCase.subtype,
    { platform: benchmarkCase.platform, format: benchmarkCase.format },
  );
  if (contract) {
    return Object.freeze({
      contractId: contract.contractId,
      contractVersion: contract.version,
    });
  }

  return Object.freeze({
    contractId: benchmarkCase.contractReference.contractIdPrefix,
    contractVersion: "unknown",
  });
}

export async function resolveBenchmarkValidationAsync(input: {
  readonly benchmarkCase: BenchmarkCase;
  readonly executionOutput: BenchmarkExecutionOutput;
  readonly organizationId: string;
  readonly executionId: string;
  readonly artifactEvaluationDeps?: BenchmarkArtifactEvaluationDeps;
  readonly createId?: (prefix: string) => string;
  readonly nowIso?: () => string;
}): Promise<BenchmarkValidationOutcome> {
  const { benchmarkCase: bc } = input;
  const contractRef = contractReferenceForBenchmark(bc);

  if (!bc.service || !bc.subtype) {
    return Object.freeze({
      kind: "validation_unavailable",
      reason: "missing_service_subtype",
      ...contractRef,
    });
  }

  let validationInput = buildBenchmarkValidationInput(input);

  if (
    input.artifactEvaluationDeps &&
    ((input.executionOutput.mediaArtifactIds?.length ?? 0) > 0 ||
      Boolean(input.executionOutput.preview?.trim()))
  ) {
    const hydrate = createArtifactHydrator({
      artifactsRepo: input.artifactEvaluationDeps.artifactsRepo,
      blobStorage: input.artifactEvaluationDeps.asyncMedia.blobStorage,
      organizationId: input.organizationId,
    });
    const runtimeDeps = resolveRuntimeEvaluationDeps({
      runRuntimeCheck: input.artifactEvaluationDeps.runRuntimeCheck,
    });
    const enrichment = await runArtifactEvaluation({
      organizationId: input.organizationId,
      executionId: input.executionId,
      outputKind: bc.outputKind,
      service: bc.service,
      subtype: bc.subtype,
      preview: input.executionOutput.preview,
      structuredData: input.executionOutput.structuredData,
      mediaArtifactIds: input.executionOutput.mediaArtifactIds,
      buildSucceeded: input.executionOutput.buildSucceeded,
      buildOutput: input.executionOutput.buildOutput,
      briefObjective: bc.inputBrief,
      hydrateArtifacts: hydrate,
      runRuntimeCheck: runtimeDeps.runRuntimeCheck,
      nowIso: input.nowIso,
    });
    validationInput = mergeArtifactEvaluationIntoValidationInput({
      base: validationInput,
      enrichment,
    });
  }

  const validation = validateOutputContract(validationInput);

  if (validation) {
    return Object.freeze({
      kind: "validated",
      validation,
    });
  }

  return Object.freeze({
    kind: "validation_unavailable",
    reason: "contract_not_composable",
    ...contractRef,
  });
}

export function resolveBenchmarkValidation(input: {
  readonly benchmarkCase: BenchmarkCase;
  readonly executionOutput: BenchmarkExecutionOutput;
  readonly organizationId: string;
  readonly executionId: string;
  readonly createId?: (prefix: string) => string;
  readonly nowIso?: () => string;
}): BenchmarkValidationOutcome {
  const { benchmarkCase: bc } = input;
  const contractRef = contractReferenceForBenchmark(bc);

  if (!bc.service || !bc.subtype) {
    return Object.freeze({
      kind: "validation_unavailable",
      reason: "missing_service_subtype",
      ...contractRef,
    });
  }

  const validation = validateOutputContract(buildBenchmarkValidationInput(input));

  if (validation) {
    return Object.freeze({
      kind: "validated",
      validation,
    });
  }

  return Object.freeze({
    kind: "validation_unavailable",
    reason: "contract_not_composable",
    ...contractRef,
  });
}

export function requireBenchmarkValidationForRecord(
  outcome: BenchmarkValidationOutcome,
  benchmarkId: string,
): OutputValidationResult {
  if (outcome.kind === "validated") {
    return outcome.validation;
  }

  throw new Error(
    `Benchmark ${benchmarkId} cannot produce a performance record: output contract validation unavailable (${outcome.reason}).`,
  );
}
