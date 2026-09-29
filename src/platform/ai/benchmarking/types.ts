/**
 * Phase 18 — Canonical Benchmarking / Evaluation contracts.
 * Observational only — does not alter production routing, flags, or CDF state.
 */

import type { OutputQAErrorCode, OutputQAStatus } from "../output-qa";
import type { CanonicalRepairResult, RepairStrategy } from "../repair";
import type { CanonicalOutputQAResult } from "../output-qa";

export const BENCHMARKING_CONTRACT_VERSION = "18.0.0" as const;

export type BenchmarkScenario =
  | "LEGACY_BASELINE"
  | "CANONICAL_GENERATION"
  | "CANONICAL_WITH_QA"
  | "CANONICAL_WITH_REPAIR";

export type BenchmarkCaseCoverage =
  | "benchmarked"
  | "partially_benchmarked"
  | "unsupported";

export type BenchmarkFinalStatus =
  | "PASS"
  | "FAIL"
  | "UNSUPPORTED"
  | "SKIPPED"
  | "ERROR";

export type BenchmarkMetricAvailability = "available" | "unavailable" | "not_applicable";

export type BenchmarkMetric = {
  readonly id: string;
  readonly category:
    | "context"
    | "artifact"
    | "authority"
    | "structured"
    | "output_qa"
    | "repair"
    | "latency"
    | "usage"
    | "isolation"
    | "meta";
  readonly value: boolean | number | string | null;
  readonly availability: BenchmarkMetricAvailability;
  readonly detail?: string;
};

export type BenchmarkExpectedContext = {
  readonly currentInstruction?: boolean;
  readonly requirements?: boolean;
  readonly approvedDecisions?: boolean;
  readonly cdfContext?: boolean;
  readonly upstreamArtifact?: boolean;
  readonly resolvedReference?: boolean;
  readonly workingMemory?: boolean;
  readonly multimodalContext?: boolean;
  readonly outputContract?: boolean;
};

export type BenchmarkExpectedUpstream = {
  readonly artifactId: string;
  readonly version: number;
  readonly structuredDataExpected?: boolean;
};

export type BenchmarkPolicy = {
  /** Measurement-only: never auto-enable production flags. */
  readonly measurementOnly: true;
  readonly allowLiveProvider: false;
  readonly allowProductionMutation: false;
  readonly allowCdfAdvance: false;
  readonly allowArtifactApprove: false;
  readonly scenarios: readonly BenchmarkScenario[];
};

export const DEFAULT_BENCHMARK_POLICY: BenchmarkPolicy = {
  measurementOnly: true,
  allowLiveProvider: false,
  allowProductionMutation: false,
  allowCdfAdvance: false,
  allowArtifactApprove: false,
  scenarios: [
    "LEGACY_BASELINE",
    "CANONICAL_GENERATION",
    "CANONICAL_WITH_QA",
    "CANONICAL_WITH_REPAIR",
  ],
};

export type BenchmarkCase = {
  readonly caseId: string;
  readonly serviceId: string;
  readonly phaseId: string;
  readonly actionId: string;
  readonly actionVersion: string;
  readonly mode: BenchmarkScenario | "MULTI";
  readonly coverage: BenchmarkCaseCoverage;
  readonly classLabel: "A" | "D" | "other";
  readonly expectedContext: BenchmarkExpectedContext;
  readonly expectedOutputContract: {
    readonly kind: string;
    readonly artifactKey?: string;
  };
  readonly expectedUpstreamArtifacts?: readonly BenchmarkExpectedUpstream[];
  readonly expectedReferences?: readonly string[];
  readonly expectedRequirements?: readonly string[];
  readonly currentInstructionSummary?: string;
  readonly supportedScenarios: readonly BenchmarkScenario[];
  readonly unsupportedScenarios?: readonly BenchmarkScenario[];
  readonly unsupportedReason?: string;
  readonly fixtureRefs?: readonly string[];
  readonly benchmarkPolicy?: Partial<BenchmarkPolicy>;
  readonly metadata?: Readonly<Record<string, unknown>>;
};

/**
 * Safe observation captured at the provider / CMR boundary (no raw prompts).
 * Produced by fixtures or ControllableDispatcher inspections in tests.
 */
export type BenchmarkContextObservation = {
  readonly currentInstructionPresent: boolean;
  readonly currentInstructionHash?: string;
  readonly requirementsPresent: boolean;
  readonly approvedDecisionsPresent: boolean;
  readonly cdfContextPresent: boolean;
  readonly upstreamArtifactIds: readonly string[];
  readonly upstreamArtifactVersions: readonly string[];
  readonly structuredUpstreamDataPresent: boolean;
  readonly resolvedReferences: readonly string[];
  readonly workingMemoryPresent: boolean;
  readonly multimodalContextPresent: boolean;
  readonly outputContractPresent: boolean;
  readonly proseOnlyInheritance?: boolean;
  readonly truncatedPreviousOutput?: boolean;
  readonly missingStructuredFields?: readonly string[];
  readonly legacyPromptReconstruction?: boolean;
  readonly authorityViolation?: boolean;
  readonly lowerAuthorityOverrodeHigher?: boolean;
  readonly sensitiveBodiesOmitted: true;
};

export type BenchmarkUsageObservation = {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly totalTokens?: number;
  readonly providerId?: string;
  readonly modelId?: string;
  readonly estimatedCost?: number | null;
  readonly costAvailable: boolean;
};

export type BenchmarkLatencyObservation = {
  readonly totalMs?: number;
  readonly contextCompilationMs?: number;
  readonly cmrAssemblyMs?: number;
  readonly modelRuntimeMs?: number;
  readonly providerMs?: number;
  readonly outputQaMs?: number;
  readonly repairMs?: number;
  readonly repairedTotalMs?: number;
};

export type BenchmarkScenarioObservation = {
  readonly scenario: BenchmarkScenario;
  readonly context?: BenchmarkContextObservation;
  readonly usage?: BenchmarkUsageObservation;
  readonly latency?: BenchmarkLatencyObservation;
  /** Precomputed or live Output QA (reuses Phase 16 types). */
  readonly qa?: CanonicalOutputQAResult;
  /** Precomputed or live Repair (reuses Phase 17 types). */
  readonly repair?: CanonicalRepairResult;
  readonly executionId?: string;
  readonly providerId?: string;
  readonly modelId?: string;
  readonly featureFlags?: {
    readonly cdfCanonicalGenerationContext: boolean;
    readonly cdfCanonicalAutomaticRepair: boolean;
  };
  readonly isolation?: {
    readonly productionMutation: false;
    readonly cdfAdvanced: false;
    readonly artifactApproved: false;
    readonly externalSideEffect: false;
  };
};

export type BenchmarkRun = {
  readonly runId: string;
  readonly caseId: string;
  readonly scenario: BenchmarkScenario;
  readonly startedAt: string;
  readonly harnessVersion: typeof BENCHMARKING_CONTRACT_VERSION;
  readonly actionId: string;
  readonly actionVersion: string;
  readonly serviceId: string;
  readonly phaseId: string;
  readonly featureFlags: {
    readonly cdfCanonicalGenerationContext: boolean;
    readonly cdfCanonicalAutomaticRepair: boolean;
  };
  readonly fixtureRefs: readonly string[];
  readonly executionId?: string;
  readonly providerId?: string;
  readonly modelId?: string;
};

export type ContextFidelityScore = {
  readonly components: Readonly<Record<string, boolean | "n/a">>;
  readonly allExpectedPresent: boolean;
};

export type ArtifactFidelityScore = {
  readonly expectedArtifactIdPresent: boolean | "n/a";
  readonly exactVersionPresent: boolean | "n/a";
  readonly structuredDataPresent: boolean | "n/a";
  readonly unexpectedVersionSubstitution: boolean;
};

export type AuthorityFidelityScore = {
  readonly currentInstructionPreserved: boolean | "n/a";
  readonly requirementsPreserved: boolean | "n/a";
  readonly referencesPreserved: boolean | "n/a";
  readonly upstreamPinsPreserved: boolean | "n/a";
  readonly noLowerAuthorityOverride: boolean;
};

export type StructuredFidelityScore = {
  readonly proseOnlyInheritance: boolean;
  readonly truncatedPreviousOutput: boolean;
  readonly missingStructuredFields: readonly string[];
  readonly legacyPromptReconstruction: boolean;
  readonly structuredOk: boolean;
};

export type OutputQaScore = {
  readonly status: OutputQAStatus | "n/a";
  readonly codes: readonly OutputQAErrorCode[];
  readonly mayAdvance?: boolean;
};

export type RepairScore = {
  readonly applicable: boolean;
  readonly initialQaStatus?: OutputQAStatus;
  readonly eligible?: boolean;
  readonly strategy?: RepairStrategy;
  readonly attempts?: number;
  readonly finalQaStatus?: OutputQAStatus;
  readonly invalidToValid?: boolean;
  readonly exhausted?: boolean;
  readonly latencyMs?: number;
  readonly incrementalTokens?: number | null;
  readonly incrementalCostAvailable: boolean;
  readonly incrementalCost?: number | null;
};

export type BenchmarkResult = {
  readonly ok: boolean;
  readonly status: BenchmarkFinalStatus;
  readonly run: BenchmarkRun;
  readonly metrics: readonly BenchmarkMetric[];
  readonly context: ContextFidelityScore;
  readonly artifact: ArtifactFidelityScore;
  readonly authority: AuthorityFidelityScore;
  readonly structured: StructuredFidelityScore;
  readonly outputQa: OutputQaScore;
  readonly repair: RepairScore;
  readonly latency: BenchmarkLatencyObservation;
  readonly usage: BenchmarkUsageObservation;
  readonly isolationHonored: boolean;
  readonly subjectiveScoreUsed: false;
  readonly secondQaSystem: false;
  readonly secondExecutionSystem: false;
  readonly secondTelemetrySystem: false;
  readonly autoEnabledFlags: false;
  readonly message: string;
  readonly metadata: Readonly<Record<string, unknown>>;
};

export type BenchmarkComparison = {
  readonly caseId: string;
  readonly legacy?: BenchmarkResult;
  readonly canonical?: BenchmarkResult;
  readonly deltas: readonly BenchmarkMetric[];
  readonly focus: "architectural_properties";
  readonly textEqualityRequired: false;
};
