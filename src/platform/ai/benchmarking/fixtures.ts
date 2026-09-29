/**
 * Phase 18 — Safe observation builders for deterministic benchmark tests.
 * No production mutation; no private payloads.
 */

import type {
  CanonicalOutputQAResult,
  OutputQAErrorCode,
  OutputQAStatus,
} from "../output-qa";
import type {
  BenchmarkContextObservation,
  BenchmarkScenarioObservation,
} from "./types";

export function buildSafeContextObservation(
  partial?: Partial<BenchmarkContextObservation>,
): BenchmarkContextObservation {
  return {
    currentInstructionPresent: true,
    currentInstructionHash: "instr_hash_demo",
    requirementsPresent: true,
    approvedDecisionsPresent: true,
    cdfContextPresent: true,
    upstreamArtifactIds: [],
    upstreamArtifactVersions: [],
    structuredUpstreamDataPresent: false,
    resolvedReferences: [],
    workingMemoryPresent: false,
    multimodalContextPresent: false,
    outputContractPresent: true,
    proseOnlyInheritance: false,
    truncatedPreviousOutput: false,
    missingStructuredFields: [],
    legacyPromptReconstruction: false,
    authorityViolation: false,
    lowerAuthorityOverrodeHigher: false,
    sensitiveBodiesOmitted: true,
    ...partial,
  };
}

export function buildQaResultStub(input: {
  readonly status: OutputQAStatus;
  readonly codes?: readonly OutputQAErrorCode[];
  readonly actionId?: string;
  readonly actionVersion?: string;
}): CanonicalOutputQAResult {
  const codes = input.codes ?? [];
  return {
    status: input.status,
    mayAdvance: input.status === "VALID",
    diagnostics: codes.map((code) => ({
      code,
      severity: "error" as const,
      message: code,
      authoritativeSource: "benchmark_fixture",
    })),
    checksPerformed: ["output_contract"],
    actionId: input.actionId ?? "cdf.phase.presentation.storyline.generate",
    actionVersion: input.actionVersion ?? "1.0.0",
    outputKind: "generation_result",
    executionId: "exec_bench_stub",
    metadata: {
      outputQaContractVersion: "16.0.0",
      fromBenchmarkFixture: true,
    },
  };
}

export function buildUnsupportedClassDObservation(input: {
  readonly scenario?: BenchmarkScenarioObservation["scenario"];
  readonly actionId: string;
  readonly actionVersion?: string;
}): BenchmarkScenarioObservation {
  return {
    scenario: input.scenario ?? "CANONICAL_WITH_QA",
    context: buildSafeContextObservation({
      upstreamArtifactIds: [],
      upstreamArtifactVersions: [],
      structuredUpstreamDataPresent: false,
      requirementsPresent: false,
      approvedDecisionsPresent: false,
    }),
    qa: buildQaResultStub({
      status: "UNSUPPORTED",
      codes: ["UNSUPPORTED_VALIDATION"],
      actionId: input.actionId,
      actionVersion: input.actionVersion,
    }),
    usage: { costAvailable: false },
    latency: { totalMs: 12, outputQaMs: 2 },
    featureFlags: {
      cdfCanonicalGenerationContext: false,
      cdfCanonicalAutomaticRepair: false,
    },
    isolation: {
      productionMutation: false,
      cdfAdvanced: false,
      artifactApproved: false,
      externalSideEffect: false,
    },
    executionId: "exec_classd_bench",
  };
}
