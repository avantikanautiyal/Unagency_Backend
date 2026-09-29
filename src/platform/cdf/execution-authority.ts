/**
 * CDF execution authority — single precedence for canonical CDF creates.
 *
 * After resolveCdfPhaseExecutionContract() + applyCdfExecutionAuthority():
 * - product catalog / subtype maps MUST NOT reinterpret modality/outputKind
 * - ExecutionSpec may contribute constraints / preferences but cannot override
 *   CDF output kind, modality, artifact key, or execution strategy
 * - incompatible Spec semantic reinterpretation is deferred (not applied);
 *   structured conflict metadata is stamped — Spec never wins over CDF
 * - post-authority writers MUST call reassertCdfExecutionAuthority() so sealed
 *   fields cannot drift
 *
 * No serviceId / phaseId branches.
 */

import type { ServiceOutputKind } from "../config/service-output-map";
import {
  resolveCdfPhaseExecutionContract,
  type CdfPhaseExecutionContract,
} from "./canonical";

export const CDF_EXECUTION_CONTRACT_CONFLICT = "CDF_EXECUTION_CONTRACT_CONFLICT";

export type CdfAuthorityOutputKind = ServiceOutputKind;

/** Metadata keys stamped when CDF authority is applied. */
export const CDF_EXECUTION_AUTHORITY_META = {
  applied: "cdfExecutionAuthorityApplied",
  source: "cdfAuthoritySource",
  outputKind: "cdfAuthorityOutputKind",
  generationModality: "cdfAuthorityGenerationModality",
  capability: "cdfAuthorityCapability",
  artifactKey: "cdfAuthorityArtifactKey",
  strategy: "cdfAuthorityExecutionStrategy",
  structuredOutputName: "cdfAuthorityStructuredOutputName",
} as const;

/** Fields sealed after authority — must not be independently rewritten. */
export const CDF_SEALED_SEMANTIC_KEYS = [
  "outputKind",
  "outputModalities",
  "generationModality",
  "cdfExecutionStrategy",
  "cdfArtifactKey",
  "capabilityId",
  "capabilityHint",
] as const;

function readString(
  meta: Readonly<Record<string, unknown>> | undefined,
  key: string,
): string | undefined {
  const v = meta?.[key];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

export function resolveCdfContractFromMetadata(
  metadata: Readonly<Record<string, unknown>> | undefined,
): CdfPhaseExecutionContract | undefined {
  if (!metadata) return undefined;
  const strategy = readString(metadata, "cdfExecutionStrategy");
  if (strategy !== "canonical" && strategy !== "route_visual") {
    const session = readString(metadata, "cdfSessionId");
    const phase = readString(metadata, "cdfPhaseId");
    if (!session || !phase) return undefined;
  }
  return resolveCdfPhaseExecutionContract({
    serviceId:
      readString(metadata, "cdfServiceId") ||
      readString(metadata, "serviceId") ||
      readString(metadata, "service"),
    phaseId: readString(metadata, "cdfPhaseId"),
  });
}

/**
 * Derive authoritative ServiceOutputKind from the CDF phase contract.
 * Returns undefined when the phase does not produce a generatable deliverable kind.
 */
export function outputKindFromCdfContract(
  contract: CdfPhaseExecutionContract,
): CdfAuthorityOutputKind | undefined {
  const modality = contract.generationModality;
  const role = contract.semanticRole;

  if (modality === "none" || modality === "materialize") return undefined;

  if (modality === "image" || modality === "hybrid") return "image";
  if (modality === "video") return "video";

  if (modality === "text" || role === "text_choice") return "text";

  if (modality === "structured") {
    if (role === "deck") return "presentation";
    if (role === "email") return "email";
    if (role === "document") return "document";
    if (role === "video") return "video";
    if (role === "visual" || role === "multi_visual" || role === "mockup") {
      return "image";
    }
    // structured_approval / strategy / intermediate docs are canonical
    // structured artifacts — not PDF/DOCX/PPTX export phases.
    return "text";
  }

  return undefined;
}

/**
 * True when the authoritative CDF phase contract declares a document /
 * presentation / email deliverable that may run legacy export materialization.
 * Driven by semantic role / structured export plan names — never by ExecutionSpec
 * PDF/DOCX preferences alone. No serviceId / phaseId branches.
 */
export function cdfContractAuthorizesDocumentExport(
  contract: CdfPhaseExecutionContract,
): boolean {
  const role = contract.semanticRole;
  if (role === "document" || role === "deck" || role === "email") {
    return true;
  }
  const planName = (
    contract.structuredOutputContract?.name ?? ""
  ).trim().toLowerCase();
  if (
    planName === "documentplan" ||
    planName === "presentationplan" ||
    planName === "emailplan" ||
    planName === "presentationroutes"
  ) {
    return true;
  }
  return false;
}

/**
 * Capability from contract — single derivation (no hardcoded prepass correction).
 */
export function capabilityFromCdfContract(
  contract: CdfPhaseExecutionContract,
): string {
  if (
    typeof contract.requiredCapability === "string" &&
    contract.requiredCapability.trim()
  ) {
    return contract.requiredCapability.trim();
  }
  const kind = outputKindFromCdfContract(contract);
  if (kind === "video") return "video.generate";
  if (
    kind === "image" ||
    kind === "image_mockup" ||
    kind === "image_3d_mockup" ||
    kind === "human_form"
  ) {
    return "image.generate";
  }
  if (kind === "edited_image") return "image.edit";
  return "text.generate";
}

/** True when CDF modality must not receive PNG/JPG image production Spec. */
export function cdfContractIsNonVisual(
  contract: CdfPhaseExecutionContract,
): boolean {
  const modality = contract.generationModality;
  if (
    modality === "text" ||
    modality === "none" ||
    modality === "materialize"
  ) {
    return true;
  }
  if (contract.semanticRole === "text_choice") return true;
  if (modality === "structured") {
    const kind = outputKindFromCdfContract(contract);
    // Structured visual roles still need media; structured docs/approvals do not.
    return (
      kind !== "image" &&
      kind !== "video" &&
      kind !== "edited_image" &&
      kind !== "image_mockup" &&
      kind !== "image_3d_mockup" &&
      kind !== "human_form"
    );
  }
  const kind = outputKindFromCdfContract(contract);
  if (kind === "text") return true;
  return false;
}

/**
 * Whether the live execution plane requires raw media artifact IDs (art_*, Vault
 * image/video bytes). Structured/text CDF phases with cdfart_*@V do not.
 * Driven by CDF authority stamps — never by product ZIP/HTML deliverable prefs.
 */
export function cdfExecutionRequiresMediaArtifact(
  metadata: Readonly<Record<string, unknown>> | null | undefined,
): boolean {
  if (!metadata || typeof metadata !== "object") return true;
  const modality = (
    (typeof metadata.cdfAuthorityGenerationModality === "string" &&
      metadata.cdfAuthorityGenerationModality) ||
    (typeof metadata.cdfGenerationModality === "string" &&
      metadata.cdfGenerationModality) ||
    ""
  )
    .trim()
    .toLowerCase();
  if (
    modality === "structured" ||
    modality === "text" ||
    modality === "none" ||
    modality === "materialize"
  ) {
    return false;
  }
  if (
    modality === "image" ||
    modality === "video" ||
    modality === "hybrid"
  ) {
    return true;
  }
  if (metadata.skipOutputRequirements === true) return false;
  if (metadata.cdfSkipImageProductionSpec === true) return false;
  // Explicit website code-gen structured contracts still need materialization artifacts.
  const so = metadata.structuredOutput;
  const structuredName =
    so && typeof so === "object"
      ? String((so as { name?: unknown }).name ?? "").trim()
      : typeof metadata.cdfAuthorityStructuredOutputName === "string"
        ? metadata.cdfAuthorityStructuredOutputName.trim()
        : "";
  if (/^(WebsitePage|WebProject|WebsiteRoutes)$/i.test(structuredName)) {
    return true;
  }
  const outputKind =
    typeof metadata.outputKind === "string"
      ? metadata.outputKind.trim().toLowerCase()
      : "";
  if (outputKind === "deferred_website" || outputKind === "website") {
    // Only when CDF did not seal a non-visual authority kind.
    const sealed =
      typeof metadata.cdfAuthorityOutputKind === "string"
        ? metadata.cdfAuthorityOutputKind.trim().toLowerCase()
        : "";
    if (sealed === "text" || sealed === "document" || sealed === "presentation" || sealed === "email") {
      return false;
    }
    return true;
  }
  return false;
}

export function kindsConflict(
  cdfKind: CdfAuthorityOutputKind,
  otherKind: string,
): boolean {
  const o = otherKind.trim().toLowerCase();
  const c = cdfKind.toLowerCase();
  if (o === c) return false;
  const imageFamily = new Set([
    "image",
    "image_mockup",
    "image_3d_mockup",
    "edited_image",
    "human_form",
  ]);
  // Phase text/structured artifact kinds vs final export document kinds are
  // distinct semantics — treat as incompatible so Spec cannot reinterpret
  // a text/routes phase as document materialization.
  const phaseTextFamily = new Set(["text"]);
  const exportDocFamily = new Set([
    "document",
    "presentation",
    "email",
    "deferred_website",
  ]);
  const textOrExportFamily = new Set([...phaseTextFamily, ...exportDocFamily]);
  if (imageFamily.has(c) && textOrExportFamily.has(o)) return true;
  if (textOrExportFamily.has(c) && imageFamily.has(o)) return true;
  if (phaseTextFamily.has(c) && exportDocFamily.has(o)) return true;
  if (exportDocFamily.has(c) && phaseTextFamily.has(o)) return true;
  if (c === "document" && (o === "presentation" || o === "email")) return true;
  if (c === "presentation" && (o === "document" || o === "email")) return true;
  if (c === "email" && (o === "document" || o === "presentation")) return true;
  if (c === "video" && o !== "video" && o !== "animation") return true;
  if ((o === "video" || o === "animation") && c !== "video") return true;
  return c !== o;
}

/** Deliverable shape needed for phase-scoped Spec kind authority (provenance-aware). */
export type PhaseScopedSpecDeliverable = {
  readonly format: string;
  readonly provenance?: { readonly explicit?: boolean; readonly source?: string };
};

export type PhaseScopedSpecKindAuthority =
  | "none"
  | "explicit_deliverable"
  | "compatible_product_default"
  | "deferred_product_default"
  | "deferred_incompatible_spec";

/**
 * Product/session deliverable intent vs CDF phase execution authority.
 *
 * - Spec deliverables are phase-authoritative only when compatible with the CDF
 *   phase output kind.
 * - Incompatible Spec kinds (explicit or product-default) — including final
 *   export formats like PDF/DOCX on a text/routes phase — are deferred. They
 *   remain grounding / preference only and must NOT become
 *   executionSpecOutputKind that can reinterpret the phase.
 *
 * No serviceId / phaseId branches — driven by cdfOutputKind + deliverable provenance.
 */
export function resolvePhaseAuthoritativeExecutionSpecOutputKind(input: {
  readonly cdfOutputKind?: string | null;
  readonly deliverables?: readonly PhaseScopedSpecDeliverable[] | null;
  readonly outputKindFromAllDeliverables?: string | null;
  readonly outputKindFromExplicitDeliverables?: string | null;
}): {
  readonly executionSpecOutputKind?: string;
  readonly authority: PhaseScopedSpecKindAuthority;
  readonly deferredProductOutputKind?: string;
} {
  const cdfKind =
    typeof input.cdfOutputKind === "string" && input.cdfOutputKind.trim()
      ? input.cdfOutputKind.trim()
      : undefined;

  const explicitKind =
    typeof input.outputKindFromExplicitDeliverables === "string" &&
    input.outputKindFromExplicitDeliverables.trim()
      ? input.outputKindFromExplicitDeliverables.trim()
      : undefined;

  if (explicitKind) {
    if (
      cdfKind &&
      kindsConflict(cdfKind as CdfAuthorityOutputKind, explicitKind)
    ) {
      // Final-product / export Spec intent must not reinterpret this phase.
      return {
        authority: "deferred_incompatible_spec",
        deferredProductOutputKind: explicitKind,
      };
    }
    return {
      executionSpecOutputKind: explicitKind,
      authority: "explicit_deliverable",
    };
  }

  const allKind =
    typeof input.outputKindFromAllDeliverables === "string" &&
    input.outputKindFromAllDeliverables.trim()
      ? input.outputKindFromAllDeliverables.trim()
      : undefined;

  if (!allKind) {
    return { authority: "none" };
  }

  // No CDF kind → product defaults may still inform non-CDF creates.
  if (!cdfKind) {
    return {
      executionSpecOutputKind: allKind,
      authority: "compatible_product_default",
    };
  }

  if (!kindsConflict(cdfKind as CdfAuthorityOutputKind, allKind)) {
    return {
      executionSpecOutputKind: allKind,
      authority: "compatible_product_default",
    };
  }

  // Product-default final deliverable (e.g. PNG/JPG or PDF/DOCX) is incompatible
  // with this intermediate CDF phase — defer; do not manufacture a hard fail.
  return {
    authority: "deferred_product_default",
    deferredProductOutputKind: allKind,
  };
}

export type ApplyCdfExecutionAuthorityResult =
  | {
      ok: true;
      metadata: Record<string, unknown>;
      contract?: CdfPhaseExecutionContract;
      applied: boolean;
      /** Structured conflict when Spec was deferred; CDF still applied. */
      deferredConflict?: {
        code: typeof CDF_EXECUTION_CONTRACT_CONFLICT;
        message: string;
        details: Record<string, unknown>;
      };
    }
  | {
      ok: false;
      code: typeof CDF_EXECUTION_CONTRACT_CONFLICT;
      message: string;
      details: Record<string, unknown>;
    };

/**
 * Apply CDF execution contract as authority over product-map / ExecutionSpec kinds.
 *
 * Incompatible ExecutionSpec semantic interpretation is deferred: CDF fields are
 * sealed, Spec preferences are retained as deferred metadata, and a structured
 * conflict record is stamped. Spec never overwrites outputKind / modality /
 * artifact key / strategy. Hard fail-closed is reserved for callers that cannot
 * continue without Spec winning — this function does not let Spec win.
 */
export function applyCdfExecutionAuthority(input: {
  metadata: Readonly<Record<string, unknown>>;
  proposedOutputKind?: string | null;
  executionSpecOutputKind?: string | null;
}): ApplyCdfExecutionAuthorityResult {
  const contract = resolveCdfContractFromMetadata(input.metadata);
  if (!contract || contract.executionStrategy === "none") {
    return {
      ok: true,
      metadata: { ...input.metadata },
      applied: false,
    };
  }

  const cdfKind = outputKindFromCdfContract(contract);
  if (!cdfKind) {
    return {
      ok: true,
      metadata: { ...input.metadata },
      contract,
      applied: false,
    };
  }

  const proposed =
    (typeof input.proposedOutputKind === "string" &&
      input.proposedOutputKind.trim()) ||
    readString(input.metadata, "outputKind");

  const explicitSpec =
    typeof input.executionSpecOutputKind === "string" &&
    input.executionSpecOutputKind.trim()
      ? input.executionSpecOutputKind.trim()
      : undefined;

  let deferredConflict:
    | {
        code: typeof CDF_EXECUTION_CONTRACT_CONFLICT;
        message: string;
        details: Record<string, unknown>;
      }
    | undefined;

  if (explicitSpec && kindsConflict(cdfKind, explicitSpec)) {
    // Soft-defer: record structured conflict, keep CDF authoritative.
    deferredConflict = {
      code: CDF_EXECUTION_CONTRACT_CONFLICT,
      message:
        "ExecutionSpec deliverables conflict with CDF phase execution contract",
      details: {
        serviceId: contract.serviceId,
        phaseId: contract.phaseId,
        artifactKey: contract.artifactKey,
        cdfGenerationModality: contract.generationModality,
        cdfOutputKind: cdfKind,
        executionSpecOutputKind: explicitSpec,
        executionSpecDeliverables: input.metadata.executionSpecDeliverables,
        proposedOutputKind: proposed,
        authoritySource: "cdf_execution_contract",
        conflictFields: ["outputKind", "generationModality"],
        resolution: "deferred_incompatible_spec",
      },
    };
  }

  const capability = capabilityFromCdfContract(contract);
  const soName = contract.structuredOutputContract?.name;
  const authorizesDocExport = cdfContractAuthorizesDocumentExport(contract);

  const next: Record<string, unknown> = {
    ...input.metadata,
    outputKind: cdfKind,
    outputModalities:
      cdfKind === "text"
        ? ["text"]
        : cdfKind === "presentation"
          ? ["presentation", "document"]
          : cdfKind === "document" || cdfKind === "email"
            ? ["document"]
            : cdfKind === "video"
              ? ["video"]
              : cdfKind === "image" ||
                  cdfKind === "image_mockup" ||
                  cdfKind === "image_3d_mockup" ||
                  cdfKind === "edited_image"
                ? ["image"]
                : input.metadata.outputModalities,
    capabilityId: capability,
    capabilityHint: capability,
    [CDF_EXECUTION_AUTHORITY_META.applied]: true,
    [CDF_EXECUTION_AUTHORITY_META.source]: "cdf_execution_contract",
    [CDF_EXECUTION_AUTHORITY_META.outputKind]: cdfKind,
    [CDF_EXECUTION_AUTHORITY_META.generationModality]:
      contract.generationModality,
    [CDF_EXECUTION_AUTHORITY_META.capability]: capability,
    [CDF_EXECUTION_AUTHORITY_META.artifactKey]: contract.artifactKey,
    [CDF_EXECUTION_AUTHORITY_META.strategy]: contract.executionStrategy,
    ...(soName
      ? { [CDF_EXECUTION_AUTHORITY_META.structuredOutputName]: soName }
      : {}),
    cdfExecutionStrategy: contract.executionStrategy,
    cdfArtifactKey: contract.artifactKey,
    cdfSemanticRole: contract.semanticRole,
    cdfAuthorityAuthorizesDocumentExport: authorizesDocExport,
    ...(cdfContractIsNonVisual(contract)
      ? {
          skipOutputRequirements: true,
          skipProductionSpecInstruct: true,
          cdfSkipImageProductionSpec: true,
        }
      : {}),
    ...(deferredConflict
      ? {
          cdfExecutionSpecConflict: true,
          cdfExecutionSpecConflictCode: deferredConflict.code,
          cdfExecutionSpecConflictMessage: deferredConflict.message,
          cdfDeferredIncompatibleSpecOutputKind: explicitSpec,
          cdfExecutionSpecConflictDetails: deferredConflict.details,
          // Never leave Spec kind as live outputKind after conflict.
          ...(input.metadata.cdfExecutionSpecKindAuthority !==
          "deferred_incompatible_spec"
            ? {
                cdfExecutionSpecKindAuthority: "deferred_incompatible_spec",
              }
            : {}),
        }
      : {}),
  };

  return {
    ok: true,
    metadata: next,
    contract,
    applied: true,
    ...(deferredConflict ? { deferredConflict } : {}),
  };
}

/**
 * Re-seal authoritative fields after any post-authority enrichment.
 */
export function reassertCdfExecutionAuthority(
  metadata: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  if (metadata[CDF_EXECUTION_AUTHORITY_META.applied] !== true) {
    return { ...metadata };
  }
  const sealedKind = readString(
    metadata,
    CDF_EXECUTION_AUTHORITY_META.outputKind,
  );
  const sealedCapability = readString(
    metadata,
    CDF_EXECUTION_AUTHORITY_META.capability,
  );
  const sealedArtifact = readString(
    metadata,
    CDF_EXECUTION_AUTHORITY_META.artifactKey,
  );
  const sealedStrategy = readString(
    metadata,
    CDF_EXECUTION_AUTHORITY_META.strategy,
  );
  const sealedModality = readString(
    metadata,
    CDF_EXECUTION_AUTHORITY_META.generationModality,
  );

  const next: Record<string, unknown> = { ...metadata };
  if (sealedKind) {
    next.outputKind = sealedKind;
    next.outputModalities =
      sealedKind === "text"
        ? ["text"]
        : sealedKind === "presentation"
          ? ["presentation", "document"]
          : sealedKind === "document" || sealedKind === "email"
            ? ["document"]
            : sealedKind === "video"
              ? ["video"]
              : sealedKind === "image" ||
                  sealedKind === "image_mockup" ||
                  sealedKind === "image_3d_mockup" ||
                  sealedKind === "edited_image"
                ? ["image"]
                : next.outputModalities;
  }
  if (sealedCapability) {
    next.capabilityId = sealedCapability;
    next.capabilityHint = sealedCapability;
  }
  if (sealedArtifact) next.cdfArtifactKey = sealedArtifact;
  if (sealedStrategy) next.cdfExecutionStrategy = sealedStrategy;
  if (sealedModality) {
    next[CDF_EXECUTION_AUTHORITY_META.generationModality] = sealedModality;
  }
  return next;
}

export function isCdfExecutionAuthorityApplied(
  metadata: Readonly<Record<string, unknown>> | undefined,
): boolean {
  return metadata?.[CDF_EXECUTION_AUTHORITY_META.applied] === true;
}

/**
 * Single resolution of authoritative vs catalog output kind.
 * Canonical CDF → CDF contract; non-CDF → product map.
 */
export function resolveExecutionOutputAuthority(input: {
  metadata?: Readonly<Record<string, unknown>>;
  catalogOutputKind?: string | null;
  declaredOutputKind?: string | null;
}): {
  authoritySource: "cdf_execution_contract" | "product_output_map" | "declared";
  authoritativeOutputKind: string | undefined;
  catalogOutputKind: string | undefined;
  actualOutputKind: string | undefined;
} {
  const catalog =
    (typeof input.catalogOutputKind === "string" &&
      input.catalogOutputKind.trim()) ||
    undefined;
  const declared =
    (typeof input.declaredOutputKind === "string" &&
      input.declaredOutputKind.trim()) ||
    readString(input.metadata, "outputKind");

  if (isCdfExecutionAuthorityApplied(input.metadata)) {
    const sealed =
      readString(input.metadata, CDF_EXECUTION_AUTHORITY_META.outputKind) ||
      declared;
    return {
      authoritySource: "cdf_execution_contract",
      authoritativeOutputKind: sealed,
      catalogOutputKind: catalog,
      actualOutputKind: declared,
    };
  }

  if (catalog) {
    return {
      authoritySource: "product_output_map",
      authoritativeOutputKind: catalog,
      catalogOutputKind: catalog,
      actualOutputKind: declared,
    };
  }

  return {
    authoritySource: "declared",
    authoritativeOutputKind: declared,
    catalogOutputKind: catalog,
    actualOutputKind: declared,
  };
}
