/**
 * Phase 13C — CDF service dependency & artifact contract classification.
 *
 * Read-only analysis over the canonical registry + known deep-ingest inventory.
 * Does NOT create ingest adapters.
 */

import {
  listCdfCanonicalServiceIds,
  resolveCdfCanonicalService,
} from "../../cdf/canonical";
import {
  CDF_DEEP_INGEST_RUNTIME_SERVICES,
  isDeterministicModality,
  isLlmGenerationModality,
  type CdfPhaseInventory,
} from "./acceptance-matrix";

/** Service-level contract classification (Part 3). */
export type CdfServiceDependencyClass =
  | "A" // ARTIFACT-BACKED MULTI-STAGE
  | "B" // GENERATION-ONLY / TERMINAL
  | "C" // METADATA/CONFIG-BACKED (service-level rare)
  | "D"; // INCOMPLETE / DEFECT — content needed, no authoritative mechanism

export type CdfDependencyEdgeKind =
  | "content" // downstream LLM needs upstream generated semantic content
  | "config" // dimensions / route labels / IDs / gates
  | "none"; // no semantic dependency

export type CdfDependencyEdge = {
  readonly fromPhaseId: string;
  readonly toPhaseId: string;
  readonly kind: CdfDependencyEdgeKind;
  readonly fromIsLlm: boolean;
  readonly toIsLlm: boolean;
  readonly artifactKey?: string;
};

export type CdfPhaseContractRow = {
  readonly serviceId: string;
  readonly phaseId: string;
  readonly modelOrDeterministic: "model" | "deterministic";
  readonly producesOutput: boolean;
  readonly outputType: string;
  readonly artifactKey?: string;
  readonly persistedAuthoritatively: boolean;
  readonly artifactVersion: boolean;
  readonly pinned: boolean;
  readonly downstreamConsumers: readonly string[];
  readonly contentRequiredDownstream: boolean;
  readonly currentMechanism: string;
  readonly status: "PASS" | "PASS WITH LIMITATIONS" | "DEFECT" | "NOT APPLICABLE";
};

export type CdfServiceDependencyContract = {
  readonly serviceId: string;
  readonly displayName: string;
  readonly classification: CdfServiceDependencyClass;
  readonly classificationLabel: string;
  readonly reason: string;
  readonly hasDeepIngestRuntime: boolean;
  readonly phases: readonly CdfPhaseInventory[];
  readonly modelPhases: readonly string[];
  readonly deterministicPhases: readonly string[];
  readonly artifactProducingPhases: readonly string[];
  readonly dependencyConsumingPhases: readonly string[];
  readonly edges: readonly CdfDependencyEdge[];
  readonly contentDependentEdges: readonly CdfDependencyEdge[];
  readonly requiresArtifactVersionContinuity: boolean;
  readonly requiresConversationalArtifactContinuity: boolean;
  readonly acceptanceStatus: "PASS" | "PASS WITH LIMITATIONS" | "DEFECT";
  readonly phaseRows: readonly CdfPhaseContractRow[];
};

const CLASS_LABEL: Record<CdfServiceDependencyClass, string> = {
  A: "CLASS A — ARTIFACT-BACKED MULTI-STAGE",
  B: "CLASS B — GENERATION-ONLY / TERMINAL",
  C: "CLASS C — METADATA/CONFIG-BACKED",
  D: "CLASS D — INCOMPLETE / DEFECT",
};

/**
 * Known deep-ingest services (adapters + tryIngest* bridges exist).
 * Source: generation-artifact adapters + presentation/packaging/social-media runtimes.
 */
export function hasDeepIngestRuntime(serviceId: string): boolean {
  return (CDF_DEEP_INGEST_RUNTIME_SERVICES as readonly string[]).includes(
    serviceId,
  );
}

function activePhases(serviceId: string): CdfPhaseInventory[] {
  const svc = resolveCdfCanonicalService(serviceId);
  if (!svc) return [];
  return svc.phases
    .filter((p) => p.implementationStatus === "active")
    .map((p) => {
      const modality = String(p.generationModality);
      return {
        serviceId: p.serviceId,
        phaseId: p.phaseId,
        name: p.name,
        uxType: String(p.uxType),
        generationModality: modality,
        executionStrategy: String(p.executionStrategy),
        implementationStatus: String(p.implementationStatus),
        isLlmGeneration: isLlmGenerationModality(modality),
        isDeterministic: isDeterministicModality(modality),
        inherits: p.dependencies.map((d) => d.phaseId),
        artifactKey: p.artifact?.artifactKey,
        selectionMode: String(p.selection?.mode ?? "none"),
        approvalMode: String(p.approval?.mode ?? "not_applicable"),
        refineEnabled: Boolean(p.refinement?.enabled),
      };
    });
}

/**
 * Classify a dependency edge:
 * - LLM → LLM = content (downstream needs generated semantic content)
 * - none/config → anything = config
 * - LLM → materialize/none = none (or config if selection only)
 */
export function classifyDependencyEdge(
  from: CdfPhaseInventory,
  to: CdfPhaseInventory,
): CdfDependencyEdgeKind {
  if (from.isLlmGeneration && to.isLlmGeneration) return "content";
  if (from.isDeterministic && from.generationModality === "none") return "config";
  if (to.isDeterministic && to.generationModality === "materialize") {
    return from.isLlmGeneration ? "none" : "config";
  }
  if (from.isLlmGeneration && to.isDeterministic) return "config";
  return "config";
}

function buildEdges(phases: readonly CdfPhaseInventory[]): CdfDependencyEdge[] {
  const byId = new Map(phases.map((p) => [p.phaseId, p]));
  const edges: CdfDependencyEdge[] = [];
  for (const to of phases) {
    for (const fromId of to.inherits) {
      const from = byId.get(fromId);
      if (!from) continue;
      edges.push({
        fromPhaseId: from.phaseId,
        toPhaseId: to.phaseId,
        kind: classifyDependencyEdge(from, to),
        fromIsLlm: from.isLlmGeneration,
        toIsLlm: to.isLlmGeneration,
        artifactKey: from.artifactKey,
      });
    }
  }
  return edges;
}

function mechanismFor(
  serviceId: string,
  phase: CdfPhaseInventory,
  deep: boolean,
  contentRequiredDownstream: boolean,
): string {
  if (phase.isDeterministic && phase.generationModality === "materialize") {
    return "deterministic materialize / export";
  }
  if (phase.isDeterministic && phase.generationModality === "none") {
    return "CDF session selection / config gate";
  }
  if (deep && phase.isLlmGeneration) {
    return "ArtifactVersion via tryIngest* + session pin (approved/selectedArtifacts)";
  }
  if (contentRequiredDownstream) {
    return "legacy approval.note / route label only (≤1500 inherit) — NOT authoritative ArtifactVersion";
  }
  if (phase.isLlmGeneration) {
    return "generation output (terminal or no content-dep consumer in active graph)";
  }
  return "CDF session state";
}

function buildPhaseRows(
  serviceId: string,
  phases: readonly CdfPhaseInventory[],
  edges: readonly CdfDependencyEdge[],
  deep: boolean,
  classification: CdfServiceDependencyClass,
): CdfPhaseContractRow[] {
  return phases.map((phase) => {
    const consumers = edges
      .filter((e) => e.fromPhaseId === phase.phaseId)
      .map((e) => e.toPhaseId);
    const contentRequiredDownstream = edges.some(
      (e) => e.fromPhaseId === phase.phaseId && e.kind === "content",
    );
    const producesOutput = phase.isLlmGeneration || phase.generationModality === "none";
    const authoritative =
      deep && phase.isLlmGeneration
        ? true
        : phase.isDeterministic
          ? true
          : !contentRequiredDownstream;

    let status: CdfPhaseContractRow["status"] = "PASS";
    if (phase.isDeterministic) status = "NOT APPLICABLE";
    else if (deep && phase.isLlmGeneration) status = "PASS";
    else if (contentRequiredDownstream && classification === "D") status = "DEFECT";
    else if (!deep && phase.isLlmGeneration && !contentRequiredDownstream) {
      status = "PASS WITH LIMITATIONS";
    } else if (!deep && phase.isLlmGeneration) status = "DEFECT";

    return {
      serviceId,
      phaseId: phase.phaseId,
      modelOrDeterministic: phase.isLlmGeneration ? "model" : "deterministic",
      producesOutput,
      outputType: phase.generationModality,
      artifactKey: phase.artifactKey,
      persistedAuthoritatively: authoritative && (deep || phase.isDeterministic),
      artifactVersion: deep && phase.isLlmGeneration,
      pinned: deep && phase.isLlmGeneration,
      downstreamConsumers: consumers,
      contentRequiredDownstream,
      currentMechanism: mechanismFor(
        serviceId,
        phase,
        deep,
        contentRequiredDownstream,
      ),
      status,
    };
  });
}

function classifyService(
  serviceId: string,
  edges: readonly CdfDependencyEdge[],
  deep: boolean,
): {
  classification: CdfServiceDependencyClass;
  reason: string;
  acceptanceStatus: CdfServiceDependencyContract["acceptanceStatus"];
} {
  const contentEdges = edges.filter((e) => e.kind === "content");
  const hasContentChain = contentEdges.length > 0;

  if (deep && hasContentChain) {
    return {
      classification: "A",
      reason:
        "Multi-stage LLM→LLM content dependency with dedicated ArtifactVersion ingest + session pins.",
      acceptanceStatus:
        serviceId === "presentation"
          ? "PASS"
          : "PASS WITH LIMITATIONS", // packaging/social opt-in flags
    };
  }

  if (deep && !hasContentChain) {
    return {
      classification: "A",
      reason: "Deep ingest present; treat as artifact-backed service.",
      acceptanceStatus: "PASS",
    };
  }

  if (!hasContentChain) {
    // Only config / terminal generation — rare at full-service level
    const onlyConfig = edges.every(
      (e) => e.kind === "config" || e.kind === "none",
    );
    if (onlyConfig) {
      return {
        classification: "C",
        reason:
          "No LLM→LLM content edges; downstream depends on config/selection/metadata only.",
        acceptanceStatus: "PASS",
      };
    }
    return {
      classification: "B",
      reason:
        "Generation does not feed another model phase as authoritative content.",
      acceptanceStatus: "PASS",
    };
  }

  // Content-dependent chain without deep ingest → Class D
  return {
    classification: "D",
    reason:
      "Downstream model phase(s) require prior generated semantic content, but no ArtifactVersion ingest/adapter exists; legacy approval.note/route labels are not authoritative.",
    acceptanceStatus: "DEFECT",
  };
}

/** Build the full dependency contract for one service from the canonical registry. */
export function buildServiceDependencyContract(
  serviceId: string,
): CdfServiceDependencyContract {
  const svc = resolveCdfCanonicalService(serviceId);
  const phases = activePhases(serviceId);
  const edges = buildEdges(phases);
  const deep = hasDeepIngestRuntime(serviceId);
  const { classification, reason, acceptanceStatus } = classifyService(
    serviceId,
    edges,
    deep,
  );
  const contentDependentEdges = edges.filter((e) => e.kind === "content");
  const modelPhases = phases.filter((p) => p.isLlmGeneration).map((p) => p.phaseId);
  const deterministicPhases = phases
    .filter((p) => p.isDeterministic)
    .map((p) => p.phaseId);
  const artifactProducingPhases = phases
    .filter((p) => Boolean(p.artifactKey) && p.isLlmGeneration)
    .map((p) => p.phaseId);
  const dependencyConsumingPhases = phases
    .filter((p) => p.inherits.length > 0)
    .map((p) => p.phaseId);

  return {
    serviceId,
    displayName: svc?.displayName ?? serviceId,
    classification,
    classificationLabel: CLASS_LABEL[classification],
    reason,
    hasDeepIngestRuntime: deep,
    phases,
    modelPhases,
    deterministicPhases,
    artifactProducingPhases,
    dependencyConsumingPhases,
    edges,
    contentDependentEdges,
    requiresArtifactVersionContinuity: contentDependentEdges.length > 0,
    requiresConversationalArtifactContinuity: contentDependentEdges.length > 0,
    acceptanceStatus,
    phaseRows: buildPhaseRows(
      serviceId,
      phases,
      edges,
      deep,
      classification,
    ),
  };
}

/** Contracts for every canonical CDF service. */
export function buildAllServiceDependencyContracts(): CdfServiceDependencyContract[] {
  return listCdfCanonicalServiceIds().map(buildServiceDependencyContract);
}

/** Assert no content-dependent edge is silently treated as config-only. */
export function assertNoSilentMetadataOnlyOnContentEdges(
  contract: CdfServiceDependencyContract,
): void {
  for (const edge of contract.contentDependentEdges) {
    if (edge.kind !== "content") {
      throw new Error(
        `${contract.serviceId}: content edge misclassified ${edge.fromPhaseId}→${edge.toPhaseId}`,
      );
    }
    if (!edge.fromIsLlm || !edge.toIsLlm) {
      throw new Error(
        `${contract.serviceId}: content edge must be LLM→LLM (${edge.fromPhaseId}→${edge.toPhaseId})`,
      );
    }
  }
}

/** Authoritative mechanism string for content-dependent downstream phases. */
export function authoritativeMechanismForContentEdge(
  contract: CdfServiceDependencyContract,
  edge: CdfDependencyEdge,
): "ArtifactVersion" | "MISSING" | "config" {
  if (edge.kind !== "content") return "config";
  if (contract.hasDeepIngestRuntime) return "ArtifactVersion";
  return "MISSING";
}
