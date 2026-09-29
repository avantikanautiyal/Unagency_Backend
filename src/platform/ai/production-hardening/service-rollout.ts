/**
 * Phase 19 — 15-service rollout readiness classification.
 * Distinguishes generation readiness from artifact-continuity readiness.
 */

import {
  CDF_DEEP_INGEST_RUNTIME_SERVICES,
  inventoryCdfApplicationServices,
} from "../conversational-runtime/acceptance-matrix";
import { buildServiceDependencyContract } from "../conversational-runtime/dependency-contracts";
import type { RolloutReadiness, RolloutStage, ServiceRolloutRow } from "./types";

const CLASS_A = new Set<string>(CDF_DEEP_INGEST_RUNTIME_SERVICES);

export function classifyServiceRollout(serviceId: string): ServiceRolloutRow {
  const contract = buildServiceDependencyContract(serviceId);
  const inv = inventoryCdfApplicationServices().find(
    (s) => s.serviceId === serviceId,
  );
  const hasPhases = Boolean(inv && inv.phases.length > 0);

  if (CLASS_A.has(serviceId)) {
    const limitations: string[] = [
      "HTTP create still uses DirectExecutionEngine spine (strangler)",
      "Output QA / Repair not auto-wired on all HTTP paths (opt-in)",
      "Progressive enablement only — flags default OFF",
    ];
    return {
      serviceId,
      classLabel: "A",
      readiness: "READY_WITH_LIMITATIONS",
      generationReady: true,
      artifactContinuityComplete: true,
      limitations,
      recommendedStage: "STAGE_2_CLASS_A_ALLOWLIST",
    };
  }

  if (contract.classification === "D" || !CLASS_A.has(serviceId)) {
    return {
      serviceId,
      classLabel: "D",
      readiness: "READY_WITH_LIMITATIONS",
      generationReady: hasPhases,
      artifactContinuityComplete: false,
      limitations: [
        "artifactContinuityComplete: false",
        "Deep ArtifactVersion ingest absent — UNSUPPORTED continuity, not FAILED",
        "Do not claim Problem B solved for this service",
        "Repair must not convert UNSUPPORTED → VALID",
        contract.reason ? contract.reason : "",
      ].filter(Boolean),
      recommendedStage: "STAGE_3_BROADER_SERVICES",
    };
  }

  return {
    serviceId,
    classLabel: "other",
    readiness: "LEGACY_ONLY",
    generationReady: false,
    artifactContinuityComplete: false,
    limitations: ["Unknown service classification"],
    recommendedStage: "STAGE_0_OFF",
  };
}

export function listServiceRolloutClassifications(): readonly ServiceRolloutRow[] {
  return inventoryCdfApplicationServices().map((s) =>
    classifyServiceRollout(s.serviceId),
  );
}

export function summarizeRolloutReadiness(): Readonly<
  Record<RolloutReadiness, number>
> {
  const rows = listServiceRolloutClassifications();
  const out: Record<RolloutReadiness, number> = {
    READY: 0,
    READY_WITH_LIMITATIONS: 0,
    BLOCKED: 0,
    LEGACY_ONLY: 0,
  };
  for (const r of rows) out[r.readiness] += 1;
  return out;
}

export function recommendedStageForService(
  serviceId: string,
): RolloutStage {
  return classifyServiceRollout(serviceId).recommendedStage;
}
