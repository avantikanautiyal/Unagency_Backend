/**
 * P4.9 — Canonical image provider capability flags derived from verified specs.
 * Provider-independent; conversational intelligence must not hardcode vendor logic.
 */

import type { VerifiedImageProviderSpec } from "./verified-image-provider-specs";
import {
  ALL_IMAGE_PROVIDER_SPECS,
  GOOGLE_IMAGEN_SPEC,
  IDEOGRAM_IMAGE_SPEC,
  RECRAFT_IMAGE_SPEC,
} from "./verified-image-provider-specs";

export type ImageProviderCapabilityFlag =
  | "TEXT_TO_IMAGE"
  | "IMAGE_TO_IMAGE"
  | "IMAGE_EDIT"
  | "REFERENCE_IMAGE"
  | "MULTI_IMAGE_INPUT"
  | "MASKED_EDIT";

export type ImageProviderCapabilityProfile = Readonly<{
  providerId: string;
  capabilities: readonly ImageProviderCapabilityFlag[];
  supportsReferenceImage: boolean;
  supportsImageEdit: boolean;
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

  return Object.freeze({
    providerId: spec.canonicalProviderId,
    capabilities: Object.freeze(capabilities),
    supportsReferenceImage: spec.supportsReferenceImage,
    supportsImageEdit: spec.supportsImageEdit,
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

/** True when the provider can accept a style/logo reference on generate (not necessarily edit). */
export function providerSupportsReferenceImage(providerId: string): boolean {
  const id = providerId.trim();
  // OpenAI gpt-image-* uses /v1/images/edits with attached images (ChatGPT-class).
  if (id === "provider.openai") return true;
  return Boolean(capabilityProfileForProvider(id)?.supportsReferenceImage);
}

/** Providers that can take a reference mark on image.generate (logo continuity). */
export function listReferenceImageProviderIds(): readonly string[] {
  const fromSpecs = ALL_IMAGE_PROVIDER_SPECS.filter(
    (spec) => spec.vendorApiVerified && spec.supportsReferenceImage,
  ).map((spec) => spec.canonicalProviderId);
  const ids = new Set<string>([...fromSpecs, "provider.openai"]);
  return Object.freeze([...ids]);
}

export function listReferenceCapableImageProviderIds(): readonly string[] {
  return Object.freeze(
    ALL_IMAGE_PROVIDER_SPECS.filter(
      (spec) => spec.vendorApiVerified && spec.supportsReferenceImage && spec.supportsImageEdit,
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
});
