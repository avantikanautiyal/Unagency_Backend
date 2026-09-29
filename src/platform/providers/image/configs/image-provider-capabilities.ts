/**
 * P4.9 — Canonical image provider capability flags derived from verified specs.
 * Provider-independent; conversational intelligence must not hardcode vendor logic.
 */

import type { VerifiedImageProviderSpec } from "./verified-image-provider-specs";
import {
  ALL_IMAGE_PROVIDER_SPECS,
  GOOGLE_IMAGEN_SPEC,
  IDEOGRAM_IMAGE_SPEC,
  OPENAI_IMAGE_SPEC,
  RECRAFT_IMAGE_SPEC,
} from "./verified-image-provider-specs";

export type ImageProviderCapabilityFlag =
  | "TEXT_TO_IMAGE"
  | "IMAGE_TO_IMAGE"
  | "IMAGE_EDIT"
  | "REFERENCE_IMAGE"
  | "MULTI_IMAGE_INPUT"
  | "MASKED_EDIT"
  /**
   * Declared / verified ability to render required communication text into the
   * final image with the fidelity expected by the framework.
   *
   * Does NOT mean: can receive a prompt containing text.
   * Does NOT mean: can sometimes render words / vendor docs mention text.
   * Distinct from TEXT_TO_IMAGE and from per-execution structural acceptance.
   *
   * Undeclared providers are not hard-excluded unless ≥1 executable declares it
   * (see UNDECLARED_HARD_CAPABILITY_POLICY = degrade_to_soft).
   */
  | "ON_ASSET_TEXT";

export type ImageProviderCapabilityProfile = Readonly<{
  providerId: string;
  capabilities: readonly ImageProviderCapabilityFlag[];
  supportsReferenceImage: boolean;
  supportsImageEdit: boolean;
  supportsOnAssetText?: boolean;
}>;

const SPEC_BY_PROVIDER = new Map<string, VerifiedImageProviderSpec>(
  ALL_IMAGE_PROVIDER_SPECS.map((spec) => [spec.canonicalProviderId, spec]),
);

export function verifiedImageSpecForProvider(
  providerId: string,
): VerifiedImageProviderSpec | undefined {
  return SPEC_BY_PROVIDER.get(providerId.trim());
}

export function capabilityProfileForImageSpec(
  spec: VerifiedImageProviderSpec,
): ImageProviderCapabilityProfile {
  const capabilities: ImageProviderCapabilityFlag[] = [];
  if (spec.supportsTextToImage) capabilities.push("TEXT_TO_IMAGE");
  if (spec.supportsReferenceImage) {
    capabilities.push("REFERENCE_IMAGE");
    capabilities.push("IMAGE_TO_IMAGE");
  }
  if (spec.supportsImageEdit) capabilities.push("IMAGE_EDIT");
  if (spec.supportsMultiImageInput) capabilities.push("MULTI_IMAGE_INPUT");
  if (spec.supportsMaskedEdit) capabilities.push("MASKED_EDIT");
  if (spec.supportsOnAssetText) capabilities.push("ON_ASSET_TEXT");

  return Object.freeze({
    providerId: spec.canonicalProviderId,
    capabilities: Object.freeze(capabilities),
    supportsReferenceImage: spec.supportsReferenceImage,
    supportsImageEdit: spec.supportsImageEdit,
    ...(spec.supportsOnAssetText != null
      ? { supportsOnAssetText: spec.supportsOnAssetText }
      : {}),
  });
}

export function capabilityProfileForProvider(
  providerId: string,
): ImageProviderCapabilityProfile | undefined {
  const spec = verifiedImageSpecForProvider(providerId);
  return spec ? capabilityProfileForImageSpec(spec) : undefined;
}

/** True when the provider can accept a reference artifact and perform grounded modification. */
export function providerSupportsReferenceImageEdit(providerId: string): boolean {
  const profile = capabilityProfileForProvider(providerId);
  return Boolean(profile?.supportsReferenceImage && profile.supportsImageEdit);
}

/**
 * Selected *operation* for this dispatch — not the provider's advertised max capability.
 * REFERENCE_IMAGE_EDIT only when a reference image is actually in play.
 */
export type SelectedImageOperationCapability =
  | "TEXT_TO_IMAGE"
  | "REFERENCE_IMAGE"
  | "REFERENCE_IMAGE_EDIT"
  | "IMAGE_EDIT";

export function resolveSelectedImageOperationCapability(input: {
  readonly providerId: string;
  readonly referenceImageAttached?: boolean;
  readonly referenceInputPresent?: boolean;
  readonly visualOperationKind?: string;
  readonly capabilityId?: string;
}): SelectedImageOperationCapability {
  const refInUse =
    input.referenceImageAttached === true ||
    input.referenceInputPresent === true;
  const op = String(input.visualOperationKind ?? "").toUpperCase();
  const cap = String(input.capabilityId ?? "").toLowerCase();
  const editIntent =
    cap === "image.edit" ||
    op === "MODIFY" ||
    op === "REGENERATE" ||
    op === "EDIT";

  if (!refInUse) {
    return "TEXT_TO_IMAGE";
  }
  if (editIntent && providerSupportsReferenceImageEdit(input.providerId)) {
    return "REFERENCE_IMAGE_EDIT";
  }
  if (providerSupportsReferenceImage(input.providerId)) {
    return editIntent ? "IMAGE_EDIT" : "REFERENCE_IMAGE";
  }
  return "TEXT_TO_IMAGE";
}

/** True when the provider declares reference-image support in its capability spec. */
export function providerSupportsReferenceImage(providerId: string): boolean {
  return Boolean(
    capabilityProfileForProvider(providerId.trim())?.supportsReferenceImage,
  );
}

/** True when the provider profile explicitly declares ON_ASSET_TEXT. */
export function providerSupportsOnAssetText(providerId: string): boolean {
  const profile = capabilityProfileForProvider(providerId.trim());
  return Boolean(
    profile?.supportsOnAssetText ||
      profile?.capabilities.includes("ON_ASSET_TEXT"),
  );
}

/**
 * Verified/declared on-asset text fidelity — never inferred from TEXT_TO_IMAGE
 * or from the mere ability to accept a text prompt containing copy.
 */
export function providerDeclaresVerifiedOnAssetTextFidelity(
  providerId: string,
): boolean {
  return classifyImageCapabilityClaim(providerId, "ON_ASSET_TEXT") === "declared";
}

/**
 * TEXT_TO_IMAGE / prompt acceptance ≠ ON_ASSET_TEXT fidelity.
 * Architectural reminder for capability consumers and tests.
 */
export function textPromptAcceptanceIsNotRenderedTextFidelity(): true {
  return true;
}

export function providerHasImageCapability(
  providerId: string,
  capability: ImageProviderCapabilityFlag,
): boolean {
  const id = providerId.trim();
  const profile = capabilityProfileForProvider(id);

  if (capability === "TEXT_TO_IMAGE") {
    if (profile) return profile.capabilities.includes("TEXT_TO_IMAGE");
    // No image capability declaration: modality-layer assumption for
    // image.generate executables. Never implies ON_ASSET_TEXT.
    return true;
  }
  if (capability === "REFERENCE_IMAGE") {
    return providerSupportsReferenceImage(id);
  }
  if (capability === "ON_ASSET_TEXT") {
    return providerSupportsOnAssetText(id);
  }
  return Boolean(profile?.capabilities.includes(capability));
}

/**
 * Classify how a capability claim is known for a provider.
 * Phase 11 — prevents treating undeclared / inferred claims as verified.
 */
export type ImageCapabilityClaimKind =
  | "verified"
  | "declared"
  | "inferred"
  | "unsupported"
  | "undeclared";

export function classifyImageCapabilityClaim(
  providerId: string,
  capability: ImageProviderCapabilityFlag,
): ImageCapabilityClaimKind {
  const id = providerId.trim();
  const spec = verifiedImageSpecForProvider(id);

  if (capability === "ON_ASSET_TEXT") {
    if (spec?.supportsOnAssetText === true) return "declared";
    if (spec?.supportsOnAssetText === false) return "unsupported";
    return "undeclared";
  }

  if (capability === "TEXT_TO_IMAGE") {
    if (spec?.vendorApiVerified && spec.supportsTextToImage) return "verified";
    if (spec && !spec.supportsTextToImage) return "unsupported";
    // Executables without an image capability declaration
    return "inferred";
  }

  if (capability === "REFERENCE_IMAGE") {
    if (spec?.vendorApiVerified && spec.supportsReferenceImage) return "verified";
    if (spec && !spec.supportsReferenceImage) return "unsupported";
    return "undeclared";
  }

  if (capability === "IMAGE_EDIT") {
    if (spec?.vendorApiVerified && spec.supportsImageEdit) return "verified";
    if (spec && !spec.supportsImageEdit) return "unsupported";
    return "undeclared";
  }

  if (capability === "IMAGE_TO_IMAGE") {
    if (spec?.vendorApiVerified && spec.supportsReferenceImage) return "verified";
    if (spec && !spec.supportsReferenceImage) return "unsupported";
    return "undeclared";
  }

  if (capability === "MULTI_IMAGE_INPUT") {
    if (spec?.supportsMultiImageInput === true) return "declared";
    if (spec?.supportsMultiImageInput === false) return "unsupported";
    return "undeclared";
  }

  if (capability === "MASKED_EDIT") {
    if (spec?.supportsMaskedEdit === true) return "declared";
    if (spec?.supportsMaskedEdit === false) return "unsupported";
    return "undeclared";
  }

  return "undeclared";
}

/** Audit snapshot for LIVE-oriented image providers × key capabilities. */
export function auditImageProviderCapabilityClaims(
  providerIds: readonly string[] = [
    IDEOGRAM_IMAGE_SPEC.canonicalProviderId,
    RECRAFT_IMAGE_SPEC.canonicalProviderId,
    GOOGLE_IMAGEN_SPEC.canonicalProviderId,
    OPENAI_IMAGE_SPEC.canonicalProviderId,
  ],
): ReadonlyArray<{
  readonly providerId: string;
  readonly capability: ImageProviderCapabilityFlag;
  readonly claim: ImageCapabilityClaimKind;
  readonly hasCapability: boolean;
}> {
  const caps: ImageProviderCapabilityFlag[] = [
    "TEXT_TO_IMAGE",
    "REFERENCE_IMAGE",
    "IMAGE_EDIT",
    "ON_ASSET_TEXT",
    "MULTI_IMAGE_INPUT",
    "MASKED_EDIT",
  ];
  const rows = [];
  for (const providerId of providerIds) {
    for (const capability of caps) {
      rows.push({
        providerId,
        capability,
        claim: classifyImageCapabilityClaim(providerId, capability),
        hasCapability: providerHasImageCapability(providerId, capability),
      });
    }
  }
  return Object.freeze(rows);
}

/** Providers that declare reference-image support (registry-derived only). */
export function listReferenceImageProviderIds(): readonly string[] {
  return Object.freeze(
    ALL_IMAGE_PROVIDER_SPECS.filter(
      (spec) => spec.vendorApiVerified && spec.supportsReferenceImage,
    ).map((spec) => spec.canonicalProviderId),
  );
}

export function listReferenceCapableImageProviderIds(): readonly string[] {
  return Object.freeze(
    ALL_IMAGE_PROVIDER_SPECS.filter(
      (spec) =>
        spec.vendorApiVerified &&
        spec.supportsReferenceImage &&
        spec.supportsImageEdit,
    ).map((spec) => spec.canonicalProviderId),
  );
}

/** Default reference-capable provider for artifact-grounded modification (registry-derived). */
export function defaultReferenceCapableImageProviderId(): string | undefined {
  return listReferenceCapableImageProviderIds()[0];
}

export const REFERENCE_CAPABLE_IMAGE_PROVIDERS_FOR_TESTS = Object.freeze({
  google: GOOGLE_IMAGEN_SPEC.canonicalProviderId,
  ideogram: IDEOGRAM_IMAGE_SPEC.canonicalProviderId,
  recraft: RECRAFT_IMAGE_SPEC.canonicalProviderId,
  openai: OPENAI_IMAGE_SPEC.canonicalProviderId,
});
