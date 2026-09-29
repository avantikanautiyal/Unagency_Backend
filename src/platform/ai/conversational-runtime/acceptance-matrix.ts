/**
 * Phase 13B — CDF application acceptance inventory (from canonical registry).
 * Read-only helpers — does not mutate workflow definitions.
 */

import {
  listCdfCanonicalServiceIds,
  resolveCdfCanonicalService,
} from "../../cdf/canonical";

const LLM_MODALITIES = new Set(["text", "structured", "image", "video"]);
const DETERMINISTIC_MODALITIES = new Set(["none", "materialize"]);

export type AcceptanceSectionStatus =
  | "PRESENT"
  | "NOT_APPLICABLE"
  | "MISSING"
  | "WRONG";

export type AcceptanceRowStatus =
  | "PASS"
  | "PASS WITH LIMITATIONS"
  | "FAIL"
  | "NOT APPLICABLE";

export type CdfPhaseInventory = {
  readonly serviceId: string;
  readonly phaseId: string;
  readonly name: string;
  readonly uxType: string;
  readonly generationModality: string;
  readonly executionStrategy: string;
  readonly implementationStatus: string;
  readonly isLlmGeneration: boolean;
  readonly isDeterministic: boolean;
  readonly inherits: readonly string[];
  readonly artifactKey?: string;
  readonly selectionMode: string;
  readonly approvalMode: string;
  readonly refineEnabled: boolean;
};

export type CdfServiceInventory = {
  readonly serviceId: string;
  readonly displayName: string;
  readonly phases: readonly CdfPhaseInventory[];
  readonly firstLlmPhaseId?: string;
  readonly firstUpstreamLlmPhaseId?: string;
  readonly hasDeepIngestRuntime: boolean;
};

/** Services with dedicated ingest bridges in this monorepo today. */
export const CDF_DEEP_INGEST_RUNTIME_SERVICES = [
  "presentation",
  "packaging",
  "social-media",
] as const;

export function isLlmGenerationModality(modality: string): boolean {
  return LLM_MODALITIES.has(modality);
}

export function isDeterministicModality(modality: string): boolean {
  return DETERMINISTIC_MODALITIES.has(modality);
}

/** Inventory every supported CDF service from the canonical registry. */
export function inventoryCdfApplicationServices(): CdfServiceInventory[] {
  const ids = listCdfCanonicalServiceIds();
  return ids.map((serviceId) => {
    const svc = resolveCdfCanonicalService(serviceId);
    if (!svc) {
      return {
        serviceId,
        displayName: serviceId,
        phases: [],
        hasDeepIngestRuntime: (
          CDF_DEEP_INGEST_RUNTIME_SERVICES as readonly string[]
        ).includes(serviceId),
      };
    }
    const phases: CdfPhaseInventory[] = svc.phases
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
    const llmPhases = phases.filter((p) => p.isLlmGeneration);
    const firstLlm = llmPhases[0];
    const firstUpstream = llmPhases.find((p) =>
      p.inherits.some((id) =>
        phases.some((u) => u.phaseId === id && u.isLlmGeneration),
      ),
    );
    return {
      serviceId,
      displayName: svc.displayName ?? serviceId,
      phases,
      firstLlmPhaseId: firstLlm?.phaseId,
      firstUpstreamLlmPhaseId: firstUpstream?.phaseId,
      hasDeepIngestRuntime: (
        CDF_DEEP_INGEST_RUNTIME_SERVICES as readonly string[]
      ).includes(serviceId),
    };
  });
}

export type CmrSectionVerdict = {
  readonly section: string;
  readonly status: AcceptanceSectionStatus;
};

/**
 * Classify CMR section presence for acceptance (PRESENT / N/A / MISSING).
 * Does not invent values when the workflow has none.
 */
export function classifyCmrSections(input: {
  readonly sections: Record<string, boolean>;
  readonly expectUpstream: boolean;
  readonly expectReferences?: boolean;
  readonly expectWorkingMemory?: boolean;
  readonly expectMultimodal?: boolean;
  readonly expectRequirements?: boolean;
}): readonly CmrSectionVerdict[] {
  const s = input.sections;
  const verdict = (
    section: string,
    present: boolean | undefined,
    applicable: boolean,
  ): CmrSectionVerdict => ({
    section,
    status: !applicable
      ? "NOT_APPLICABLE"
      : present
        ? "PRESENT"
        : "MISSING",
  });

  return [
    verdict("CURRENT USER INSTRUCTION", s.currentUserInstruction, true),
    verdict("REQUIREMENTS", s.requirements, input.expectRequirements !== false),
    verdict("CONSTRAINTS", s.constraints, false),
    verdict("EXCLUSIONS", s.exclusions, false),
    verdict("SELECTIONS", s.selections, true),
    verdict("APPROVED DECISIONS", s.approvedDecisions, true),
    verdict(
      "RESOLVED REFERENCES",
      s.resolvedReferences,
      input.expectReferences === true,
    ),
    verdict(
      "WORKING MEMORY",
      s.workingMemory,
      input.expectWorkingMemory === true,
    ),
    verdict(
      "MULTIMODAL CONTEXT",
      s.multimodalContext,
      input.expectMultimodal === true,
    ),
    verdict("UPSTREAM ARTIFACTS", s.upstreamArtifacts, input.expectUpstream),
    verdict("CDF CONTEXT", Boolean(s.cdfPhase || s.activeBrief), true),
    verdict("PRODUCTION SPEC", s.productionSpec, true),
    verdict("OUTPUT CONTRACT", s.outputContract, true),
    verdict("AUTHORITY", s.authority, true),
  ];
}
