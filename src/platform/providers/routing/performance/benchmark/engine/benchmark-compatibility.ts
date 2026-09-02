/**
 * Step 4B — Pre-execution benchmark compatibility.
 * MODEL capability vs REQUIRED benchmark capability vs EXECUTOR capability.
 */

import type { BenchmarkCase } from "../contracts/benchmark-case";
import type { BenchmarkOutcome } from "../contracts/benchmark-outcome";
import type { BenchmarkValiditySpec } from "./benchmark-validity-model";
import { resolveBenchmarkValidity } from "./benchmark-validity-model";
import {
  BENCHMARK_EXECUTOR_PROFILE,
  missingExecutionInterfaces,
  type BenchmarkExecutionInterface,
  type BenchmarkExecutionProfile,
} from "./benchmark-execution-profile";
import { resolveBenchmarkCapability } from "./benchmark-capability-resolver";
import type { ICompatibilityEngine, IModelRegistry } from "../../../../model-registry/interfaces/model-registry";
import type { CanonicalModel } from "../../../../model-registry/contracts/model";

export type BenchmarkCompatibilityVerdict = {
  readonly compatible: boolean;
  readonly modelCapabilitySupported: boolean;
  readonly executionCapabilityAvailable: boolean;
  readonly skipExecution: boolean;
  readonly outcomeIfSkipped: BenchmarkOutcome;
  readonly reasons: readonly string[];
  readonly validity: BenchmarkValiditySpec;
  readonly resolvedCapabilityId: string;
  readonly executionProfileId: string;
  readonly executionInterfacesProvided: readonly BenchmarkExecutionInterface[];
  readonly executionInterfacesRequired: readonly BenchmarkExecutionInterface[];
  readonly missingExecutionInterfaces: readonly BenchmarkExecutionInterface[];
  readonly validForModelComparison: boolean;
};

export function checkBenchmarkCompatibility(input: {
  readonly benchmarkCase: BenchmarkCase;
  readonly modelId: string;
  readonly modelRegistry?: IModelRegistry;
  readonly compatibilityEngine?: ICompatibilityEngine;
  readonly executionProfile?: BenchmarkExecutionProfile;
}): BenchmarkCompatibilityVerdict {
  const validity = resolveBenchmarkValidity(input.benchmarkCase);
  const resolved = resolveBenchmarkCapability(input.benchmarkCase);
  const profile = input.executionProfile ?? BENCHMARK_EXECUTOR_PROFILE;
  const missing = missingExecutionInterfaces(
    profile,
    validity.requiredExecutionInterfaces,
  );
  /** Build/runtime verification may remain NOT_AUTOMATED — do not block OS artifact execution. */
  const criticalMissing = missing.filter(
    (iface) => iface !== "build_execution" && iface !== "runtime_execution",
  );

  const reasons: string[] = [];
  let modelCapabilitySupported = true;

  if (input.modelRegistry && input.compatibilityEngine) {
    const modelResult = input.modelRegistry.getModel(input.modelId);
    if (!modelResult.ok) {
      modelCapabilitySupported = false;
      reasons.push(`Model not found in registry: ${input.modelId}`);
    } else {
      const compat = input.compatibilityEngine.isCompatible(
        modelResult.value,
        resolved.capabilityId,
      );
      if (compat.ok && !compat.value) {
        modelCapabilitySupported = false;
        reasons.push(
          `Model ${input.modelId} does not support required capability ${resolved.capabilityId}`,
        );
      }
      if (modelCapabilitySupported && validity.requiresStructuredOutput) {
        const structuredOk = modelSupportsStructuredOutput(modelResult.value);
        if (!structuredOk) {
          modelCapabilitySupported = false;
          reasons.push(
            `Model ${input.modelId} lacks structured-output support required for ${validity.contractOutputKind}`,
          );
        }
      }
    }
  }

  const executionCapabilityAvailable = criticalMissing.length === 0;
  if (criticalMissing.length > 0) {
    reasons.push(
      `Benchmark executor missing required interfaces: ${criticalMissing.join(", ")}`,
    );
  } else if (missing.length > 0) {
    reasons.push(
      `Optional executor interfaces unavailable (NOT_AUTOMATED): ${missing.join(", ")}`,
    );
  }

  let skipExecution = false;
  let outcomeIfSkipped: BenchmarkOutcome = "MODEL_SUCCESS";

  if (!modelCapabilitySupported) {
    skipExecution = true;
    outcomeIfSkipped = "MODEL_CAPABILITY_UNSUPPORTED";
  } else if (!executionCapabilityAvailable) {
    // Image/video/async: skip if modality dispatch unavailable
    const hardModalityGap =
      (validity.requiredModality === "image" ||
        validity.requiredModality === "video" ||
        validity.requiredModality === "audio") &&
      !profile.interfaces.includes(
        validity.requiredModality === "image"
          ? "image_generation"
          : validity.requiredModality === "video"
            ? "video_generation_async"
            : "audio_generation",
      );

    const artifactPipelineGap =
      (validity.contractOutputKind === "deferred_website" ||
        validity.contractOutputKind === "presentation" ||
        validity.contractOutputKind === "document" ||
        validity.requiredModality === "video") &&
      criticalMissing.some((iface) =>
        [
          "structured_output_mode",
          "artifact_creation",
          "image_generation",
          "image_editing",
          "video_generation_async",
        ].includes(iface),
      );

    if (hardModalityGap || artifactPipelineGap) {
      skipExecution = true;
      outcomeIfSkipped = "EXECUTION_CAPABILITY_UNAVAILABLE";
    }
  }

  const compatible =
    modelCapabilitySupported &&
    (executionCapabilityAvailable || skipExecution);

  return Object.freeze({
    compatible,
    modelCapabilitySupported,
    executionCapabilityAvailable,
    skipExecution,
    outcomeIfSkipped,
    reasons: Object.freeze(reasons),
    validity,
    resolvedCapabilityId: resolved.capabilityId,
    executionProfileId: profile.profileId,
    executionInterfacesProvided: profile.interfaces,
    executionInterfacesRequired: validity.requiredExecutionInterfaces,
    missingExecutionInterfaces: missing,
    validForModelComparison: validity.validForPureModelComparison && modelCapabilitySupported,
  });
}

function modelSupportsStructuredOutput(model: CanonicalModel): boolean {
  if (model.flags?.structuredOutput === true) return true;
  return model.capabilities.some(
    (c) =>
      c.supported &&
      (c.capabilityId === "text.generate" || c.capabilityId === "text.chat"),
  );
}

export function formatCompatibilityVerdict(verdict: BenchmarkCompatibilityVerdict): string {
  return [
    `Required capability: ${verdict.resolvedCapabilityId}`,
    `Model capability supported: ${verdict.modelCapabilitySupported}`,
    `Execution capability available: ${verdict.executionCapabilityAvailable}`,
    `Valid for pure model comparison: ${verdict.validForModelComparison}`,
    verdict.missingExecutionInterfaces.length > 0
      ? `Missing executor interfaces: ${verdict.missingExecutionInterfaces.join(", ")}`
      : "",
    ...verdict.reasons.map((r) => `  - ${r}`),
  ]
    .filter(Boolean)
    .join("\n");
}
