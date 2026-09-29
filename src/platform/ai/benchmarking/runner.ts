/**
 * Phase 18 — Benchmark runner (observational evaluation).
 * Does not mutate production CDF/artifacts/conversations or select providers.
 */

import { createHash, randomUUID } from "crypto";
import { isCdfCanonicalGenerationContextEnabled } from "../../cdf/generation-context/flag";
import { isCanonicalAutomaticRepairEnvEnabled } from "../repair";
import { resolveAction } from "../action-registry";
import {
  collectMetrics,
  scoreArtifactFidelity,
  scoreAuthorityFidelity,
  scoreContextFidelity,
  scoreOutputQa,
  scoreRepair,
  scoreStructuredFidelity,
} from "./score";
import { emitBenchmarkTrace } from "./trace";
import type {
  BenchmarkCase,
  BenchmarkFinalStatus,
  BenchmarkResult,
  BenchmarkRun,
  BenchmarkScenario,
  BenchmarkScenarioObservation,
} from "./types";
import {
  BENCHMARKING_CONTRACT_VERSION,
  DEFAULT_BENCHMARK_POLICY,
} from "./types";

function hashId(parts: string[]): string {
  return createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 16);
}

export function buildBenchmarkRun(input: {
  readonly caseDef: BenchmarkCase;
  readonly scenario: BenchmarkScenario;
  readonly observation?: BenchmarkScenarioObservation;
  readonly runId?: string;
}): BenchmarkRun {
  const flags = input.observation?.featureFlags ?? {
    cdfCanonicalGenerationContext: isCdfCanonicalGenerationContextEnabled(),
    cdfCanonicalAutomaticRepair: isCanonicalAutomaticRepairEnvEnabled(),
  };
  return {
    runId: input.runId ?? `bench_${randomUUID().slice(0, 8)}`,
    caseId: input.caseDef.caseId,
    scenario: input.scenario,
    startedAt: new Date().toISOString(),
    harnessVersion: BENCHMARKING_CONTRACT_VERSION,
    actionId: input.caseDef.actionId,
    actionVersion: input.caseDef.actionVersion,
    serviceId: input.caseDef.serviceId,
    phaseId: input.caseDef.phaseId,
    featureFlags: flags,
    fixtureRefs: input.caseDef.fixtureRefs ?? [],
    executionId: input.observation?.executionId,
    providerId: input.observation?.providerId ?? input.observation?.usage?.providerId,
    modelId: input.observation?.modelId ?? input.observation?.usage?.modelId,
  };
}

function deriveStatus(input: {
  readonly caseDef: BenchmarkCase;
  readonly scenario: BenchmarkScenario;
  readonly contextOk: boolean;
  readonly artifactOk: boolean;
  readonly authorityOk: boolean;
  readonly structuredOk: boolean;
  readonly outputQa: ReturnType<typeof scoreOutputQa>;
  readonly repair: ReturnType<typeof scoreRepair>;
}): BenchmarkFinalStatus {
  if (input.caseDef.coverage === "unsupported") {
    // Class-D: UNSUPPORTED QA is success of measurement, not FAIL
    if (
      input.outputQa.status === "UNSUPPORTED" ||
      input.outputQa.status === "n/a"
    ) {
      return "UNSUPPORTED";
    }
  }

  if (
    input.scenario === "CANONICAL_WITH_QA" ||
    input.scenario === "CANONICAL_WITH_REPAIR"
  ) {
    if (input.outputQa.status === "UNSUPPORTED") return "UNSUPPORTED";
    if (input.outputQa.status === "INVALID") {
      if (
        input.scenario === "CANONICAL_WITH_REPAIR" &&
        input.repair.invalidToValid
      ) {
        // repaired — fall through
      } else if (input.scenario === "CANONICAL_WITH_REPAIR") {
        return "FAIL";
      } else {
        return "FAIL";
      }
    }
  }

  if (input.scenario === "CANONICAL_WITH_REPAIR") {
    if (input.repair.exhausted) return "FAIL";
    if (
      input.repair.finalQaStatus === "INVALID" ||
      input.repair.finalQaStatus === "UNSUPPORTED"
    ) {
      return input.repair.finalQaStatus === "UNSUPPORTED"
        ? "UNSUPPORTED"
        : "FAIL";
    }
  }

  const archOk =
    input.contextOk &&
    input.artifactOk &&
    input.authorityOk &&
    input.structuredOk;

  if (!archOk) return "FAIL";

  if (
    (input.scenario === "CANONICAL_WITH_QA" ||
      input.scenario === "CANONICAL_WITH_REPAIR") &&
    input.outputQa.status === "VALID"
  ) {
    return "PASS";
  }

  if (
    input.scenario === "CANONICAL_WITH_REPAIR" &&
    input.repair.invalidToValid
  ) {
    return "PASS";
  }

  if (
    input.scenario === "LEGACY_BASELINE" ||
    input.scenario === "CANONICAL_GENERATION"
  ) {
    return archOk ? "PASS" : "FAIL";
  }

  return archOk ? "PASS" : "FAIL";
}

/**
 * Evaluate a single scenario observation against a benchmark case.
 * Pure scoring — does not call providers or mutate production state.
 */
export function evaluateBenchmarkScenario(input: {
  readonly caseDef: BenchmarkCase;
  readonly scenario: BenchmarkScenario;
  readonly observation: BenchmarkScenarioObservation;
  readonly runId?: string;
}): BenchmarkResult {
  const { caseDef, scenario, observation } = input;

  if (!caseDef.supportedScenarios.includes(scenario)) {
    const run = buildBenchmarkRun({ caseDef, scenario, observation, runId: input.runId });
    const result: BenchmarkResult = {
      ok: false,
      status: "UNSUPPORTED",
      run,
      metrics: [],
      context: scoreContextFidelity(caseDef.expectedContext, undefined),
      artifact: scoreArtifactFidelity(undefined, undefined),
      authority: scoreAuthorityFidelity(caseDef, undefined),
      structured: scoreStructuredFidelity(undefined),
      outputQa: { status: "n/a", codes: [] },
      repair: { applicable: false, incrementalCostAvailable: false },
      latency: {},
      usage: { costAvailable: false },
      isolationHonored: true,
      subjectiveScoreUsed: false,
      secondQaSystem: false,
      secondExecutionSystem: false,
      secondTelemetrySystem: false,
      autoEnabledFlags: false,
      message:
        caseDef.unsupportedReason ??
        `Scenario ${scenario} not supported for ${caseDef.caseId}`,
      metadata: {
        benchmarkingContractVersion: BENCHMARKING_CONTRACT_VERSION,
        scenarioUnsupported: true,
        didNotSubstituteScenario: true,
      },
    };
    emitBenchmarkTrace(result);
    return result;
  }

  // Enforce measurement-only / isolation invariants from observation
  const isolation = observation.isolation ?? {
    productionMutation: false as const,
    cdfAdvanced: false as const,
    artifactApproved: false as const,
    externalSideEffect: false as const,
  };
  const isolationHonored =
    isolation.productionMutation === false &&
    isolation.cdfAdvanced === false &&
    isolation.artifactApproved === false &&
    isolation.externalSideEffect === false;

  const policy = { ...DEFAULT_BENCHMARK_POLICY, ...caseDef.benchmarkPolicy };
  if (
    policy.allowLiveProvider ||
    policy.allowProductionMutation ||
    policy.allowCdfAdvance ||
    policy.allowArtifactApprove
  ) {
    // Policy cannot weaken isolation — reject as ERROR
    const run = buildBenchmarkRun({ caseDef, scenario, observation, runId: input.runId });
    return {
      ok: false,
      status: "ERROR",
      run,
      metrics: [],
      context: scoreContextFidelity(caseDef.expectedContext, undefined),
      artifact: scoreArtifactFidelity(undefined, undefined),
      authority: scoreAuthorityFidelity(caseDef, undefined),
      structured: scoreStructuredFidelity(undefined),
      outputQa: { status: "n/a", codes: [] },
      repair: { applicable: false, incrementalCostAvailable: false },
      latency: {},
      usage: { costAvailable: false },
      isolationHonored: false,
      subjectiveScoreUsed: false,
      secondQaSystem: false,
      secondExecutionSystem: false,
      secondTelemetrySystem: false,
      autoEnabledFlags: false,
      message: "Benchmark policy attempted to weaken isolation — rejected",
      metadata: { benchmarkingContractVersion: BENCHMARKING_CONTRACT_VERSION },
    };
  }

  const context = scoreContextFidelity(
    caseDef.expectedContext,
    observation.context,
  );
  const artifact = scoreArtifactFidelity(
    caseDef.expectedUpstreamArtifacts,
    observation.context,
  );
  const authority = scoreAuthorityFidelity(caseDef, observation.context);
  const structured = scoreStructuredFidelity(observation.context);
  const outputQa = scoreOutputQa(scenario, observation);
  const repair = scoreRepair(scenario, observation);
  const latency = observation.latency ?? {};
  const usage = observation.usage ?? { costAvailable: false };

  const artifactOk =
    artifact.expectedArtifactIdPresent !== false &&
    artifact.exactVersionPresent !== false &&
    artifact.structuredDataPresent !== false &&
    !artifact.unexpectedVersionSubstitution;

  const authorityOk =
    authority.currentInstructionPreserved !== false &&
    authority.requirementsPreserved !== false &&
    authority.referencesPreserved !== false &&
    authority.upstreamPinsPreserved !== false &&
    authority.noLowerAuthorityOverride;

  const status = deriveStatus({
    caseDef,
    scenario,
    contextOk: context.allExpectedPresent,
    artifactOk,
    authorityOk,
    structuredOk: structured.structuredOk,
    outputQa,
    repair,
  });

  // Class-D: never treat UNSUPPORTED continuity as FAIL when expected
  const finalStatus =
    caseDef.coverage === "unsupported" &&
    (outputQa.status === "UNSUPPORTED" ||
      caseDef.metadata?.expectQaStatus === "UNSUPPORTED")
      ? "UNSUPPORTED"
      : status;

  const metrics = collectMetrics({
    context,
    artifact,
    authority,
    structured,
    outputQa,
    repair,
    latency,
    usage,
    isolationHonored,
  });

  const run = buildBenchmarkRun({
    caseDef,
    scenario,
    observation,
    runId: input.runId,
  });

  const actionResolved = resolveAction(
    caseDef.actionId,
    caseDef.actionVersion,
  );
  const exactVersionOk =
    actionResolved.ok &&
    actionResolved.action.version === caseDef.actionVersion;

  const result: BenchmarkResult = {
    ok: finalStatus === "PASS" || finalStatus === "UNSUPPORTED",
    status: finalStatus,
    run,
    metrics,
    context,
    artifact,
    authority,
    structured,
    outputQa,
    repair,
    latency,
    usage,
    isolationHonored,
    subjectiveScoreUsed: false,
    secondQaSystem: false,
    secondExecutionSystem: false,
    secondTelemetrySystem: false,
    autoEnabledFlags: false,
    message:
      finalStatus === "PASS"
        ? "Benchmark architectural checks passed"
        : finalStatus === "UNSUPPORTED"
          ? "Benchmark recorded UNSUPPORTED (not FAILED)"
          : "Benchmark architectural checks failed",
    metadata: {
      benchmarkingContractVersion: BENCHMARKING_CONTRACT_VERSION,
      observationHash: hashId([
        caseDef.caseId,
        scenario,
        observation.executionId ?? "",
        String(outputQa.status),
      ]),
      exactActionVersionMatched: exactVersionOk,
      actionResolveOk: actionResolved.ok,
      measurementOnly: true,
      noProviderSelection: true,
      noPromptMegaComposer: true,
      reusedOutputQa: Boolean(observation.qa),
      reusedRepair: Boolean(observation.repair),
      flagsRecorded: true,
      isolation,
    },
  };

  emitBenchmarkTrace(result);
  return result;
}

/**
 * Run all supported scenarios for a case given a map of observations.
 * Missing scenarios are marked SKIPPED (not silently substituted).
 */
export function runBenchmarkCase(input: {
  readonly caseDef: BenchmarkCase;
  readonly observations: Partial<
    Record<BenchmarkScenario, BenchmarkScenarioObservation>
  >;
}): {
  readonly caseId: string;
  readonly results: readonly BenchmarkResult[];
} {
  const results: BenchmarkResult[] = [];
  for (const scenario of input.caseDef.supportedScenarios) {
    const obs = input.observations[scenario];
    if (!obs) {
      const run = buildBenchmarkRun({
        caseDef: input.caseDef,
        scenario,
      });
      results.push({
        ok: false,
        status: "SKIPPED",
        run,
        metrics: [],
        context: scoreContextFidelity(input.caseDef.expectedContext, undefined),
        artifact: scoreArtifactFidelity(undefined, undefined),
        authority: scoreAuthorityFidelity(input.caseDef, undefined),
        structured: scoreStructuredFidelity(undefined),
        outputQa: { status: "n/a", codes: [] },
        repair: { applicable: false, incrementalCostAvailable: false },
        latency: {},
        usage: { costAvailable: false },
        isolationHonored: true,
        subjectiveScoreUsed: false,
        secondQaSystem: false,
        secondExecutionSystem: false,
        secondTelemetrySystem: false,
        autoEnabledFlags: false,
        message: `No observation provided for ${scenario}`,
        metadata: {
          benchmarkingContractVersion: BENCHMARKING_CONTRACT_VERSION,
          skippedMissingObservation: true,
        },
      });
      continue;
    }
    results.push(
      evaluateBenchmarkScenario({
        caseDef: input.caseDef,
        scenario,
        observation: { ...obs, scenario },
      }),
    );
  }
  return { caseId: input.caseDef.caseId, results };
}

export function getBenchmarkingContractVersion(): string {
  return BENCHMARKING_CONTRACT_VERSION;
}
