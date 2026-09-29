/**
 * Phase 18 — Deterministic fidelity scoring from safe observations.
 * Reuses Output QA / Repair result shapes; does not re-validate schemas.
 */

import type {
  ArtifactFidelityScore,
  AuthorityFidelityScore,
  BenchmarkCase,
  BenchmarkContextObservation,
  BenchmarkLatencyObservation,
  BenchmarkMetric,
  BenchmarkScenario,
  BenchmarkScenarioObservation,
  BenchmarkUsageObservation,
  ContextFidelityScore,
  OutputQaScore,
  RepairScore,
  StructuredFidelityScore,
} from "./types";

export function scoreContextFidelity(
  expected: BenchmarkCase["expectedContext"],
  obs: BenchmarkContextObservation | undefined,
): ContextFidelityScore {
  if (!obs) {
    return {
      components: {
        currentInstruction: "n/a",
        requirements: "n/a",
        approvedDecisions: "n/a",
        cdfContext: "n/a",
        upstreamArtifact: "n/a",
        resolvedReference: "n/a",
        workingMemory: "n/a",
        multimodalContext: "n/a",
        outputContract: "n/a",
      },
      allExpectedPresent: false,
    };
  }

  const check = (
    want: boolean | undefined,
    present: boolean,
  ): boolean | "n/a" => {
    if (!want) return "n/a";
    return present;
  };

  const components: Record<string, boolean | "n/a"> = {
    currentInstruction: check(
      expected.currentInstruction,
      obs.currentInstructionPresent,
    ),
    requirements: check(expected.requirements, obs.requirementsPresent),
    approvedDecisions: check(
      expected.approvedDecisions,
      obs.approvedDecisionsPresent,
    ),
    cdfContext: check(expected.cdfContext, obs.cdfContextPresent),
    upstreamArtifact: check(
      expected.upstreamArtifact,
      obs.upstreamArtifactIds.length > 0,
    ),
    resolvedReference: check(
      expected.resolvedReference,
      obs.resolvedReferences.length > 0,
    ),
    workingMemory: check(expected.workingMemory, obs.workingMemoryPresent),
    multimodalContext: check(
      expected.multimodalContext,
      obs.multimodalContextPresent,
    ),
    outputContract: check(expected.outputContract, obs.outputContractPresent),
  };

  const expectedFails = Object.values(components).some((v) => v === false);
  return { components, allExpectedPresent: !expectedFails };
}

export function scoreArtifactFidelity(
  expected: BenchmarkCase["expectedUpstreamArtifacts"],
  obs: BenchmarkContextObservation | undefined,
): ArtifactFidelityScore {
  if (!expected || expected.length === 0) {
    return {
      expectedArtifactIdPresent: "n/a",
      exactVersionPresent: "n/a",
      structuredDataPresent: "n/a",
      unexpectedVersionSubstitution: false,
    };
  }
  if (!obs) {
    return {
      expectedArtifactIdPresent: false,
      exactVersionPresent: false,
      structuredDataPresent: false,
      unexpectedVersionSubstitution: false,
    };
  }

  let idOk = true;
  let versionOk = true;
  let structuredOk = true;
  let substitution = false;

  for (const exp of expected) {
    const pin = `${exp.artifactId}@${exp.version}`;
    const idPresent = obs.upstreamArtifactIds.includes(exp.artifactId);
    const versionPresent = obs.upstreamArtifactVersions.includes(pin);
    if (!idPresent) idOk = false;
    if (!versionPresent) versionOk = false;
    if (exp.structuredDataExpected && !obs.structuredUpstreamDataPresent) {
      structuredOk = false;
    }
    // Same id with different version pin → substitution signal
    const otherVersions = obs.upstreamArtifactVersions.filter(
      (v) => v.startsWith(`${exp.artifactId}@`) && v !== pin,
    );
    if (otherVersions.length > 0 && !versionPresent) substitution = true;
  }

  return {
    expectedArtifactIdPresent: idOk,
    exactVersionPresent: versionOk,
    structuredDataPresent: structuredOk,
    unexpectedVersionSubstitution: substitution,
  };
}

export function scoreAuthorityFidelity(
  caseDef: BenchmarkCase,
  obs: BenchmarkContextObservation | undefined,
): AuthorityFidelityScore {
  if (!obs) {
    return {
      currentInstructionPreserved: "n/a",
      requirementsPreserved: "n/a",
      referencesPreserved: "n/a",
      upstreamPinsPreserved: "n/a",
      noLowerAuthorityOverride: true,
    };
  }
  return {
    currentInstructionPreserved: caseDef.expectedContext.currentInstruction
      ? obs.currentInstructionPresent && !obs.authorityViolation
      : "n/a",
    requirementsPreserved: caseDef.expectedContext.requirements
      ? obs.requirementsPresent && !obs.authorityViolation
      : "n/a",
    referencesPreserved: caseDef.expectedContext.resolvedReference
      ? obs.resolvedReferences.length > 0
      : "n/a",
    upstreamPinsPreserved: caseDef.expectedContext.upstreamArtifact
      ? obs.upstreamArtifactVersions.length > 0 &&
        !obs.lowerAuthorityOverrodeHigher
      : "n/a",
    noLowerAuthorityOverride: !obs.lowerAuthorityOverrodeHigher,
  };
}

export function scoreStructuredFidelity(
  obs: BenchmarkContextObservation | undefined,
): StructuredFidelityScore {
  if (!obs) {
    return {
      proseOnlyInheritance: false,
      truncatedPreviousOutput: false,
      missingStructuredFields: [],
      legacyPromptReconstruction: false,
      structuredOk: true,
    };
  }
  const missing = obs.missingStructuredFields ?? [];
  const structuredOk =
    !obs.proseOnlyInheritance &&
    !obs.truncatedPreviousOutput &&
    missing.length === 0 &&
    !obs.legacyPromptReconstruction;
  return {
    proseOnlyInheritance: Boolean(obs.proseOnlyInheritance),
    truncatedPreviousOutput: Boolean(obs.truncatedPreviousOutput),
    missingStructuredFields: missing,
    legacyPromptReconstruction: Boolean(obs.legacyPromptReconstruction),
    structuredOk,
  };
}

export function scoreOutputQa(
  scenario: BenchmarkScenario,
  obs: BenchmarkScenarioObservation,
): OutputQaScore {
  if (
    scenario === "LEGACY_BASELINE" ||
    scenario === "CANONICAL_GENERATION"
  ) {
    if (!obs.qa) {
      return { status: "n/a", codes: [] };
    }
  }
  if (!obs.qa) {
    return { status: "n/a", codes: [] };
  }
  return {
    status: obs.qa.status,
    codes: obs.qa.diagnostics
      .filter((d) => d.severity === "error")
      .map((d) => d.code),
    mayAdvance: obs.qa.mayAdvance,
  };
}

export function scoreRepair(
  scenario: BenchmarkScenario,
  obs: BenchmarkScenarioObservation,
): RepairScore {
  if (scenario !== "CANONICAL_WITH_REPAIR") {
    return { applicable: false, incrementalCostAvailable: false };
  }
  const repair = obs.repair;
  const initial = obs.qa?.status;
  if (!repair) {
    return {
      applicable: true,
      initialQaStatus: initial,
      incrementalCostAvailable: false,
    };
  }
  const finalStatus = repair.finalQa?.status;
  const invalidToValid =
    initial === "INVALID" && finalStatus === "VALID" && repair.ok;
  return {
    applicable: true,
    initialQaStatus: initial,
    eligible: repair.plan.eligible,
    strategy: repair.plan.strategy,
    attempts: repair.attempts.length,
    finalQaStatus: finalStatus,
    invalidToValid: Boolean(invalidToValid),
    exhausted: repair.status === "EXHAUSTED",
    latencyMs: obs.latency?.repairMs,
    incrementalTokens: obs.usage?.totalTokens ?? null,
    incrementalCostAvailable: Boolean(obs.usage?.costAvailable),
    incrementalCost: obs.usage?.costAvailable
      ? (obs.usage.estimatedCost ?? null)
      : null,
  };
}

export function collectMetrics(input: {
  readonly context: ContextFidelityScore;
  readonly artifact: ArtifactFidelityScore;
  readonly authority: AuthorityFidelityScore;
  readonly structured: StructuredFidelityScore;
  readonly outputQa: OutputQaScore;
  readonly repair: RepairScore;
  readonly latency: BenchmarkLatencyObservation;
  readonly usage: BenchmarkUsageObservation;
  readonly isolationHonored: boolean;
}): BenchmarkMetric[] {
  const m: BenchmarkMetric[] = [];
  const push = (
    id: string,
    category: BenchmarkMetric["category"],
    value: BenchmarkMetric["value"],
    availability: BenchmarkMetric["availability"] = "available",
    detail?: string,
  ) => {
    m.push({ id, category, value, availability, detail });
  };

  for (const [k, v] of Object.entries(input.context.components)) {
    push(
      `context.${k}`,
      "context",
      v === "n/a" ? null : v,
      v === "n/a" ? "not_applicable" : "available",
    );
  }
  push(
    "context.allExpectedPresent",
    "context",
    input.context.allExpectedPresent,
  );

  push(
    "artifact.idPresent",
    "artifact",
    input.artifact.expectedArtifactIdPresent === "n/a"
      ? null
      : input.artifact.expectedArtifactIdPresent,
    input.artifact.expectedArtifactIdPresent === "n/a"
      ? "not_applicable"
      : "available",
  );
  push(
    "artifact.exactVersion",
    "artifact",
    input.artifact.exactVersionPresent === "n/a"
      ? null
      : input.artifact.exactVersionPresent,
    input.artifact.exactVersionPresent === "n/a"
      ? "not_applicable"
      : "available",
  );
  push(
    "artifact.structuredData",
    "artifact",
    input.artifact.structuredDataPresent === "n/a"
      ? null
      : input.artifact.structuredDataPresent,
    input.artifact.structuredDataPresent === "n/a"
      ? "not_applicable"
      : "available",
  );
  push(
    "artifact.versionSubstitution",
    "artifact",
    input.artifact.unexpectedVersionSubstitution,
  );

  push(
    "authority.noLowerOverride",
    "authority",
    input.authority.noLowerAuthorityOverride,
  );
  push(
    "structured.proseOnly",
    "structured",
    input.structured.proseOnlyInheritance,
  );
  push(
    "structured.truncated",
    "structured",
    input.structured.truncatedPreviousOutput,
  );
  push(
    "structured.legacyPromptReconstruction",
    "structured",
    input.structured.legacyPromptReconstruction,
  );
  push("structured.ok", "structured", input.structured.structuredOk);

  push(
    "output_qa.status",
    "output_qa",
    input.outputQa.status === "n/a" ? null : input.outputQa.status,
    input.outputQa.status === "n/a" ? "not_applicable" : "available",
  );
  push(
    "output_qa.codeCount",
    "output_qa",
    input.outputQa.codes.length,
    input.outputQa.status === "n/a" ? "not_applicable" : "available",
  );

  if (input.repair.applicable) {
    push("repair.eligible", "repair", input.repair.eligible ?? null);
    push("repair.attempts", "repair", input.repair.attempts ?? 0);
    push(
      "repair.invalidToValid",
      "repair",
      input.repair.invalidToValid ?? false,
    );
    push("repair.exhausted", "repair", input.repair.exhausted ?? false);
    push(
      "repair.latencyMs",
      "repair",
      input.repair.latencyMs ?? null,
      input.repair.latencyMs == null ? "unavailable" : "available",
    );
    push(
      "repair.incrementalCost",
      "repair",
      input.repair.incrementalCost ?? null,
      input.repair.incrementalCostAvailable ? "available" : "unavailable",
    );
  } else {
    push("repair.applicable", "repair", false, "not_applicable");
  }

  const lat = input.latency;
  for (const [id, val] of [
    ["latency.totalMs", lat.totalMs],
    ["latency.contextCompilationMs", lat.contextCompilationMs],
    ["latency.cmrAssemblyMs", lat.cmrAssemblyMs],
    ["latency.modelRuntimeMs", lat.modelRuntimeMs],
    ["latency.providerMs", lat.providerMs],
    ["latency.outputQaMs", lat.outputQaMs],
    ["latency.repairMs", lat.repairMs],
  ] as const) {
    push(
      id,
      "latency",
      val ?? null,
      val == null ? "unavailable" : "available",
    );
  }

  push(
    "usage.inputTokens",
    "usage",
    input.usage.inputTokens ?? null,
    input.usage.inputTokens == null ? "unavailable" : "available",
  );
  push(
    "usage.outputTokens",
    "usage",
    input.usage.outputTokens ?? null,
    input.usage.outputTokens == null ? "unavailable" : "available",
  );
  push(
    "usage.totalTokens",
    "usage",
    input.usage.totalTokens ?? null,
    input.usage.totalTokens == null ? "unavailable" : "available",
  );
  push(
    "usage.estimatedCost",
    "usage",
    input.usage.estimatedCost ?? null,
    input.usage.costAvailable ? "available" : "unavailable",
    input.usage.costAvailable ? undefined : "cost not present in telemetry",
  );
  push(
    "usage.providerId",
    "usage",
    input.usage.providerId ?? null,
    input.usage.providerId ? "available" : "unavailable",
  );

  push("isolation.honored", "isolation", input.isolationHonored);
  push("meta.subjectiveScore", "meta", false);
  push("meta.autoEnabledFlags", "meta", false);

  return m;
}
