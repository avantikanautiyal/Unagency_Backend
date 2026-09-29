/**
 * CDF service × phase conformance matrix — derived from the canonical registry.
 * Read-only inventory for architecture audits and regression locks.
 *
 * Status rules (Batch D/E):
 * - none / materialize → CONFORMANT (deterministic)
 * - canonical → CONFORMANT when generic (or Class-A deep) completion is available
 * - route_visual deliverable → PARTIAL (must migrate to canonical+fanout)
 * - Never demote contracts to greenwash
 */

import {
  countCdfCanonicalPhases,
  listCdfCanonicalServiceIds,
  resolveCdfCanonicalService,
} from "../canonical";
import {
  deliverableCompositionRequiredForPhase,
  resolveDeliverableCompositionContract,
} from "../../../../../Unagency-frontend/packages/api/src/domain/cdf/deliverable-composition";
import { CDF_DEEP_INGEST_RUNTIME_SERVICES } from "../../ai/conversational-runtime/acceptance-matrix";
import { isGenericCanonicalCompletionAvailable } from "../canonical-ingest";

export type ConformanceStatus =
  | "CONFORMANT"
  | "PARTIAL"
  | "BLOCKED"
  | "N_A";

export type PhaseConformanceRow = {
  readonly service: string;
  readonly phase: string;
  readonly phaseExecutionStrategy: string;
  readonly generationModality: string;
  readonly deliverableKind: string | null;
  readonly inputArtifactKeys: readonly string[];
  readonly outputArtifactKey: string | null;
  readonly canonicalRequired: boolean;
  readonly compositionRequired: boolean;
  readonly verificationRequired: boolean;
  readonly structuredOutputRequired: boolean;
  readonly canonicalCompletionAdapter: "deep" | "generic" | "none" | "missing";
  readonly canonicalIngestPath:
    | "deep"
    | "generic"
    | "generic_unavailable"
    | "none"
    | "route_visual";
  readonly presentationEligibilityRequired: boolean;
  readonly fanoutSupported: boolean;
  readonly providerCapability: string;
  readonly routingSource: "capability_matrix";
  readonly legacyPathPresent: boolean;
  readonly routeVisualPathPresent: boolean;
  readonly ingestBridge: "deep" | "generic" | "missing" | "n_a";
  readonly sessionBinding: "deep" | "generic" | "missing" | "n_a";
  readonly restartSafe: "proven_class_a" | "generic_contract" | "unproven";
  readonly status: ConformanceStatus;
  readonly notes: string;
};

const DEEP = new Set<string>(CDF_DEEP_INGEST_RUNTIME_SERVICES);

function modalityCapability(modality: string): string {
  switch (modality) {
    case "image":
      return "image.generate";
    case "video":
      return "video.generate";
    case "text":
    case "structured":
      return "text.generate";
    case "materialize":
    case "none":
      return "none";
    default:
      return "unknown";
  }
}

export function buildPhaseConformanceRow(
  serviceId: string,
  phaseId: string,
): PhaseConformanceRow | null {
  const svc = resolveCdfCanonicalService(serviceId);
  if (!svc) return null;
  const phase = svc.phases.find((p) => p.phaseId === phaseId);
  if (!phase) return null;

  const strategy = phase.executionStrategy;
  const modality = phase.generationModality;
  const deliverableKind = phase.deliverableKind ?? null;
  const composition =
    deliverableKind != null
      ? resolveDeliverableCompositionContract(deliverableKind)
      : null;
  const compositionRequired =
    deliverableCompositionRequiredForPhase({
      generationModality: modality,
      uxType: phase.uxType,
    }) && (composition != null || deliverableKind != null);
  const outputArtifactKey = phase.artifact?.artifactKey ?? null;
  const inputArtifactKeys = [
    ...new Set(
      [
        ...(phase.dependencies ?? [])
          .map((d) => (typeof d.artifactKey === "string" ? d.artifactKey : ""))
          .filter(Boolean),
        ...(phase.inputs ?? [])
          .filter((i) => i.required && i.source === "approved_artifact")
          .map((i) => i.key),
      ].filter(Boolean),
    ),
  ];
  const structuredOutputRequired = Boolean(
    phase.artifact?.structuredOutputContract,
  );
  const deep = DEEP.has(svc.serviceId);
  const genericReady = isGenericCanonicalCompletionAvailable();
  const canonicalRequired = strategy === "canonical";
  const routeVisual = strategy === "route_visual";

  let status: ConformanceStatus = "N_A";
  let notes = "";
  let canonicalIngestPath: PhaseConformanceRow["canonicalIngestPath"] = "none";
  let ingestBridge: PhaseConformanceRow["ingestBridge"] = "n_a";
  let sessionBinding: PhaseConformanceRow["sessionBinding"] = "n_a";
  let canonicalCompletionAdapter: PhaseConformanceRow["canonicalCompletionAdapter"] =
    "none";
  let restartSafe: PhaseConformanceRow["restartSafe"] = "unproven";

  if (strategy === "none" || modality === "none" || modality === "materialize") {
    status = "CONFORMANT";
    notes = "Deterministic / config / final phase — no generation ingest";
    canonicalIngestPath = "none";
    canonicalCompletionAdapter = "none";
    restartSafe = deep ? "proven_class_a" : "generic_contract";
  } else if (canonicalRequired && deep) {
    status = "CONFORMANT";
    notes =
      "Class-A deep ingest + composition/verification as contract requires";
    canonicalIngestPath = "deep";
    ingestBridge = "deep";
    sessionBinding = "deep";
    canonicalCompletionAdapter = "deep";
    restartSafe = "proven_class_a";
  } else if (canonicalRequired && genericReady) {
    status = "CONFORMANT";
    notes =
      "Contract-generic canonical completion (phase.artifact → ArtifactVersion → M9C)";
    canonicalIngestPath = "generic";
    ingestBridge = "generic";
    sessionBinding = "generic";
    canonicalCompletionAdapter = "generic";
    restartSafe = "generic_contract";
  } else if (canonicalRequired && !genericReady) {
    status = "BLOCKED";
    notes = "Canonical strategy but completion adapter unavailable";
    canonicalIngestPath = "generic_unavailable";
    ingestBridge = "missing";
    sessionBinding = "missing";
    canonicalCompletionAdapter = "missing";
  } else if (routeVisual) {
    status = "PARTIAL";
    notes =
      "Deliverable-producing route_visual — migrate to canonical + model-generation fanout";
    canonicalIngestPath = "route_visual";
    ingestBridge = deep ? "deep" : genericReady ? "generic" : "missing";
    sessionBinding = deep ? "deep" : genericReady ? "generic" : "missing";
    canonicalCompletionAdapter = deep
      ? "deep"
      : genericReady
        ? "generic"
        : "missing";
  } else {
    status = "PARTIAL";
    notes = `Unhandled strategy=${strategy}`;
  }

  return {
    service: svc.serviceId,
    phase: phase.phaseId,
    phaseExecutionStrategy: strategy,
    generationModality: modality,
    deliverableKind,
    inputArtifactKeys,
    outputArtifactKey,
    canonicalRequired,
    compositionRequired,
    verificationRequired: compositionRequired,
    structuredOutputRequired,
    canonicalCompletionAdapter,
    canonicalIngestPath,
    presentationEligibilityRequired:
      canonicalRequired || (compositionRequired && !routeVisual),
    fanoutSupported:
      (canonicalRequired &&
        (modality === "image" || modality === "hybrid" || modality === "video") &&
        phase.allowsModelGenerationFanout === true) ||
      routeVisual,
    providerCapability: modalityCapability(modality),
    routingSource: "capability_matrix",
    legacyPathPresent: false,
    routeVisualPathPresent: routeVisual,
    ingestBridge,
    sessionBinding,
    restartSafe,
    status,
    notes,
  };
}

export function buildFullConformanceMatrix(): readonly PhaseConformanceRow[] {
  const rows: PhaseConformanceRow[] = [];
  for (const serviceId of listCdfCanonicalServiceIds()) {
    const svc = resolveCdfCanonicalService(serviceId);
    if (!svc) continue;
    for (const phase of svc.phases) {
      const row = buildPhaseConformanceRow(serviceId, phase.phaseId);
      if (row) rows.push(row);
    }
  }
  return rows;
}

export function summarizeConformanceMatrix(
  rows: readonly PhaseConformanceRow[] = buildFullConformanceMatrix(),
): {
  readonly totalPhases: number;
  readonly registryPhaseCount: number;
  readonly byStatus: Record<ConformanceStatus, number>;
  readonly byStrategy: Record<string, number>;
  readonly deepIngestServices: readonly string[];
  readonly blockedCanonicalServices: readonly string[];
  readonly genericCompletionAvailable: boolean;
} {
  const byStatus: Record<ConformanceStatus, number> = {
    CONFORMANT: 0,
    PARTIAL: 0,
    BLOCKED: 0,
    N_A: 0,
  };
  const byStrategy: Record<string, number> = {};
  for (const r of rows) {
    byStatus[r.status] += 1;
    byStrategy[r.phaseExecutionStrategy] =
      (byStrategy[r.phaseExecutionStrategy] ?? 0) + 1;
  }
  const blockedCanonicalServices = [
    ...new Set(
      rows
        .filter((r) => r.status === "BLOCKED" && r.canonicalRequired)
        .map((r) => r.service),
    ),
  ].sort();
  return {
    totalPhases: rows.length,
    registryPhaseCount: countCdfCanonicalPhases(),
    byStatus,
    byStrategy,
    deepIngestServices: [...CDF_DEEP_INGEST_RUNTIME_SERVICES],
    blockedCanonicalServices,
    genericCompletionAvailable: isGenericCanonicalCompletionAvailable(),
  };
}
