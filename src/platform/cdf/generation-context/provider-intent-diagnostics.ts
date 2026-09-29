/**
 * Provider-boundary forensic diagnostics for CDF generation intent.
 * Presence / hashes / field names only — never dumps secrets or full prompts.
 */

import { createHash } from "crypto";
import type { CanonicalModelRequest } from "../../ai/canonical-model-request";
import type { CanonicalInstructionSource } from "../../ai/conversational-runtime/resolve-instruction";
import type { BrandIdentityProjectionDiagnostics } from "./resolve-brand-product-context";
import type { CanonicalGenerationRequest } from "./types";
import { assessCreativeDirectionCompleteness } from "./creative-direction-completeness";
import { composeGenerationSemanticObjective } from "./compose-semantic-objective";
import { composeDeliverableSemantics } from "./compose-deliverable-semantics";

function stableHash(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex")
    .slice(0, 16);
}

export type ProviderGenerationIntentDiagnostics = {
  service: string;
  subtype?: string;
  platform?: string;
  format?: string;
  phase: string;
  outputContractPresent: boolean;
  outputContractArtifactKey?: string;
  userInstructionPresent: boolean;
  currentUserInstructionSource?:
    | CanonicalInstructionSource
    | "explicit_input"
    | "phase_prompt";
  currentUserInstructionFingerprint?: string;
  ctiEffectiveInstructionPresent: boolean;
  activeBriefPresent: boolean;
  brandContextPresent: boolean;
  brandFactKeys: readonly string[];
  brandFactProvenance: ReadonlyArray<{ key: string; provenance: string }>;
  selectedBrandId?: string;
  selectedCanonicalBrandName?: string;
  extractedBrandEntities: readonly string[];
  extractionAttemptedIdentityMutation: boolean;
  selectedDirectionPresent: boolean;
  selectedDirectionIdentity?: string;
  selectedDirectionSemanticFields: readonly string[];
  upstreamArtifactIds: readonly string[];
  upstreamArtifactVersions: readonly string[];
  productionSpecPresent: boolean;
  referenceAssetsPresent: boolean;
  constraintsPresent: boolean;
  negativeConstraintsPresent: boolean;
  unresolvedReferenceCount: number;
  productGroundingPresent: boolean;
  /** Fingerprints for semantic continuity (not raw prompts). */
  semanticObjectiveFingerprint?: string;
  selectedDirectionCompletenessFingerprint?: string;
  selectedDirectionSufficientlyDescriptive?: boolean;
  brandIdentityFingerprint?: string;
  multimodalAssetIds: readonly string[];
  multimodalItemCount: number;
  productionSpecContentHash?: string;
  generationIntentHash: string;
  canonicalModelRequestHash: string;
  /** Canonical reference roles present on multimodal items. */
  canonicalReferenceRoles: ReadonlyArray<string>;
  referenceRoleResolutionSources: ReadonlyArray<string>;
  providerSemanticTask?: string;
  providerDeliverableSemantics?: string;
  upstreamProjectionModes: ReadonlyArray<string>;
};

export function buildProviderGenerationIntentDiagnostics(input: {
  readonly request: CanonicalGenerationRequest;
  readonly modelRequest: CanonicalModelRequest;
  readonly productionSpecPresent: boolean;
  readonly referenceAssetsPresent: boolean;
  readonly currentUserInstructionSource?:
    | CanonicalInstructionSource
    | "explicit_input"
    | "phase_prompt";
  readonly currentUserInstructionFingerprint?: string;
  readonly ctiEffectiveInstructionPresent?: boolean;
  readonly brandIdentity?: BrandIdentityProjectionDiagnostics;
}): ProviderGenerationIntentDiagnostics {
  const { request, modelRequest } = input;
  const choices = request.selectedSemanticChoices ?? [];
  const primary = choices[0];
  const brand = request.brandContext;
  const product = request.productGrounding;
  const identity = input.brandIdentity;

  const intentFingerprint = {
    service: request.cdfContext.serviceId,
    phase: request.cdfContext.phaseId,
    instructionLen: request.currentUserInstruction.trim().length,
    instructionSource: input.currentUserInstructionSource ?? null,
    instructionFp: input.currentUserInstructionFingerprint ?? null,
    ctiEffectivePresent: input.ctiEffectiveInstructionPresent === true,
    selectionIndexes: request.selections.map((s) => ({
      phaseId: s.phaseId,
      routeIndex: s.routeIndex ?? null,
    })),
    choiceIds: choices.map(
      (c) => `${c.artifactId}@${c.version}#${c.selectedRouteIndex}`,
    ),
    choiceFieldNames: choices.flatMap((c) => [...c.semanticFieldNames]),
    brandFactKeys: brand?.factKeys ?? [],
    brandId: brand?.brandId ?? identity?.selectedBrandId ?? null,
    brandName: brand?.brandName ?? identity?.selectedCanonicalBrandName ?? null,
    product,
    upstream: request.upstreamArtifacts.map(
      (u) => `${u.artifactId}@${u.version}`,
    ),
    outputArtifactKey: request.outputContract.artifactKey,
    requirementKeys: request.requirements.map((r) => r.key).sort(),
  };

  const semanticObjective = composeGenerationSemanticObjective(request);
  const directionCompleteness = primary
    ? assessCreativeDirectionCompleteness(primary.choice)
    : undefined;
  const multimodalAssetIds = (request.multimodalContext?.items ?? [])
    .map((item) => item.assetId)
    .filter((id): id is string => typeof id === "string" && Boolean(id.trim()));
  const canonicalReferenceRoles = (request.multimodalContext?.items ?? [])
    .map((item) => item.semanticReferenceRole)
    .filter((r): r is NonNullable<typeof r> => r != null);
  const referenceRoleResolutionSources = (request.multimodalContext?.items ?? [])
    .map((item) => item.referenceRoleResolutionSource)
    .filter((r): r is NonNullable<typeof r> => r != null);
  const deliverableSemantics = composeDeliverableSemantics({
    deliverableLabel: request.cdfContext.phaseContext.outputLabel,
    phaseName: request.cdfContext.phaseContext.name,
    artifactKey: request.outputContract.artifactKey,
    generationModality: request.outputContract.generationModality,
    productGrounding: request.productGrounding,
  });
  const providerSemanticTask = composeGenerationSemanticObjective(request);
  const upstreamProjectionModes = request.upstreamArtifacts.map(
    (u) => u.artifactProjectionMode ?? "full",
  );

  const productionSpecPart = modelRequest.messages
    .flatMap((m) => m.content)
    .find((p) => p.type === "structured" && p.name === "production_spec");
  const productionSpecContentHash =
    productionSpecPart &&
    productionSpecPart.type === "structured" &&
    productionSpecPart.data &&
    typeof productionSpecPart.data === "object" &&
    typeof (productionSpecPart.data as Record<string, unknown>).contentHash ===
      "string"
      ? String((productionSpecPart.data as Record<string, unknown>).contentHash)
      : undefined;

  return {
    service: request.cdfContext.serviceId,
    ...(product?.subtype ? { subtype: product.subtype } : {}),
    ...(product?.platform ? { platform: product.platform } : {}),
    ...(product?.format ? { format: product.format } : {}),
    phase: request.cdfContext.phaseId,
    outputContractPresent: Boolean(request.outputContract.artifactKey),
    outputContractArtifactKey: request.outputContract.artifactKey,
    userInstructionPresent: Boolean(request.currentUserInstruction.trim()),
    ...(input.currentUserInstructionSource
      ? { currentUserInstructionSource: input.currentUserInstructionSource }
      : {}),
    ...(input.currentUserInstructionFingerprint
      ? {
          currentUserInstructionFingerprint:
            input.currentUserInstructionFingerprint,
        }
      : {}),
    ctiEffectiveInstructionPresent:
      input.ctiEffectiveInstructionPresent === true,
    activeBriefPresent: Boolean(request.cdfContext.activeBriefId),
    brandContextPresent: Boolean(brand && brand.facts.length > 0),
    brandFactKeys: brand?.factKeys ?? [],
    brandFactProvenance: brand?.factProvenance ?? [],
    ...(identity?.selectedBrandId
      ? { selectedBrandId: identity.selectedBrandId }
      : brand?.brandId
        ? { selectedBrandId: brand.brandId }
        : {}),
    ...(identity?.selectedCanonicalBrandName
      ? { selectedCanonicalBrandName: identity.selectedCanonicalBrandName }
      : brand?.brandName
        ? { selectedCanonicalBrandName: brand.brandName }
        : {}),
    extractedBrandEntities: identity?.extractedBrandEntities ?? [],
    extractionAttemptedIdentityMutation:
      identity?.extractionAttemptedIdentityMutation === true,
    selectedDirectionPresent: choices.length > 0,
    ...(primary
      ? {
          selectedDirectionIdentity: `${primary.artifactId}@${primary.version}#${primary.choiceArrayKey}[${primary.selectedRouteIndex}]`,
        }
      : {}),
    selectedDirectionSemanticFields: primary
      ? primary.semanticFieldNames
      : [],
    upstreamArtifactIds: request.upstreamArtifacts.map((u) => u.artifactId),
    upstreamArtifactVersions: request.upstreamArtifacts.map(
      (u) => `${u.artifactId}@${u.version}`,
    ),
    productionSpecPresent: input.productionSpecPresent,
    referenceAssetsPresent: input.referenceAssetsPresent,
    constraintsPresent: request.constraints.length > 0,
    negativeConstraintsPresent: request.exclusions.length > 0,
    unresolvedReferenceCount:
      request.referenceResolution?.unresolvedCount ?? 0,
    productGroundingPresent: Boolean(product),
    semanticObjectiveFingerprint: stableHash(semanticObjective),
    ...(directionCompleteness
      ? {
          selectedDirectionCompletenessFingerprint:
            directionCompleteness.semanticFingerprint,
          selectedDirectionSufficientlyDescriptive:
            directionCompleteness.sufficientlyDescriptive,
        }
      : {}),
    brandIdentityFingerprint: stableHash({
      brandId: brand?.brandId ?? identity?.selectedBrandId ?? null,
      brandName: brand?.brandName ?? identity?.selectedCanonicalBrandName ?? null,
      factKeys: brand?.factKeys ?? [],
    }),
    multimodalAssetIds,
    multimodalItemCount: request.multimodalContext?.items.length ?? 0,
    ...(productionSpecContentHash
      ? { productionSpecContentHash }
      : {}),
    generationIntentHash: stableHash(intentFingerprint),
    canonicalModelRequestHash: stableHash({
      messageCount: modelRequest.messages.length,
      roles: modelRequest.messages.map((m) => m.role),
      partNames: modelRequest.messages.flatMap((m) =>
        m.content.map((p) =>
          p.type === "structured" ? p.name : p.semanticRole ?? p.type,
        ),
      ),
    }),
    canonicalReferenceRoles,
    referenceRoleResolutionSources,
    providerSemanticTask,
    providerDeliverableSemantics: deliverableSemantics.statement,
    upstreamProjectionModes,
  };
}
