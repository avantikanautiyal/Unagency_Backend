/**
 * Verified sync image provider specs — LIVE only when vendorApiVerified=true.
 * Midjourney / HiDream / Reve / Picsart / Freepik remain catalogued but blocked.
 */

import type { IVendorImageProtocol } from "../common/vendor-image-protocol";
import { IdeogramImageProtocol } from "../ideogram/ideogram-image-protocol";
import { RecraftImageProtocol } from "../recraft/recraft-image-protocol";
import { GoogleImagenProtocol } from "../google/google-imagen-protocol";

export interface VerifiedImageProviderSpec {
  readonly canonicalProviderId: string;
  readonly vendor: string;
  readonly displayName: string;
  readonly baseUrl: string;
  readonly credentialEnvVar: string;
  readonly enableEnvVar: string;
  readonly liveSmokeEnvVar: string;
  readonly authHeaderKind: "x-key" | "api-key" | "bearer" | "x-goog-api-key";
  readonly vendorApiVerified: boolean;
  readonly blockedReason?: string;
  readonly inventoryModelId: string;
  readonly wireModelId: string;
  readonly supportsTextToImage: boolean;
  /** P4.9 — provider accepts a reference / source image on the wire request. */
  readonly supportsReferenceImage: boolean;
  /** P4.9 — provider supports modification of an existing image artifact. */
  readonly supportsImageEdit: boolean;
  /** Optional multi-image or masked edit (registry only; not assumed from vendor name). */
  readonly supportsMultiImageInput?: boolean;
  readonly supportsMaskedEdit?: boolean;
  readonly createProtocol: () => IVendorImageProtocol;
}

export const IDEOGRAM_IMAGE_SPEC: VerifiedImageProviderSpec = {
  canonicalProviderId: "provider.ideogram",
  vendor: "ideogram",
  displayName: "Ideogram",
  baseUrl: "https://api.ideogram.ai",
  credentialEnvVar: "IDEOGRAM_API_KEY",
  enableEnvVar: "IDEOGRAM_ENABLED",
  liveSmokeEnvVar: "RUN_LIVE_IDEOGRAM_IMAGE_SMOKE",
  authHeaderKind: "api-key",
  vendorApiVerified: true,
  inventoryModelId: "ideogram-3",
  wireModelId: "V_3",
  supportsTextToImage: true,
  supportsReferenceImage: true,
  supportsImageEdit: false,
  createProtocol: () => new IdeogramImageProtocol(),
};

export const RECRAFT_IMAGE_SPEC: VerifiedImageProviderSpec = {
  canonicalProviderId: "provider.recraft",
  vendor: "recraft",
  displayName: "Recraft",
  baseUrl: "https://external.api.recraft.ai",
  credentialEnvVar: "RECRAFT_API_KEY",
  enableEnvVar: "RECRAFT_ENABLED",
  liveSmokeEnvVar: "RUN_LIVE_RECRAFT_IMAGE_SMOKE",
  authHeaderKind: "bearer",
  vendorApiVerified: true,
  inventoryModelId: "recraft-v3",
  wireModelId: "recraftv3",
  supportsTextToImage: true,
  supportsReferenceImage: true,
  supportsImageEdit: false,
  createProtocol: () => new RecraftImageProtocol(),
};

/** Matrix: Gemini flash-image — photorealistic / general (Imagen :predict deprecated for new keys). */
export const GOOGLE_IMAGEN_SPEC: VerifiedImageProviderSpec = {
  canonicalProviderId: "provider.google",
  vendor: "google",
  displayName: "Google Gemini Image",
  baseUrl: "https://generativelanguage.googleapis.com/v1beta",
  credentialEnvVar: "GEMINI_API_KEY",
  enableEnvVar: "GEMINI_ENABLED",
  liveSmokeEnvVar: "RUN_LIVE_GOOGLE_IMAGEN_SMOKE",
  authHeaderKind: "x-goog-api-key",
  vendorApiVerified: true,
  inventoryModelId: "gemini-2.5-flash-image",
  wireModelId: "gemini-2.5-flash-image",
  supportsTextToImage: true,
  supportsReferenceImage: true,
  supportsImageEdit: true,
  createProtocol: () => new GoogleImagenProtocol(),
};

function blockedImage(
  partial: Omit<
    VerifiedImageProviderSpec,
    | "vendorApiVerified"
    | "supportsTextToImage"
    | "supportsReferenceImage"
    | "supportsImageEdit"
    | "createProtocol"
    | "authHeaderKind"
  > & {
    blockedReason: string;
  }
): VerifiedImageProviderSpec {
  return {
    ...partial,
    authHeaderKind: "bearer",
    vendorApiVerified: false,
    supportsTextToImage: false,
    supportsReferenceImage: false,
    supportsImageEdit: false,
    createProtocol: () => {
      throw new Error(`${partial.displayName} not executable`);
    },
  };
}

export const BLOCKED_IMAGE_PROVIDER_SPECS: readonly VerifiedImageProviderSpec[] = [
  blockedImage({
    canonicalProviderId: "provider.blackforestlabs",
    vendor: "blackforestlabs",
    displayName: "Black Forest Labs",
    baseUrl: "https://api.bfl.ai",
    credentialEnvVar: "BFL_API_KEY",
    enableEnvVar: "BFL_ENABLED",
    liveSmokeEnvVar: "RUN_LIVE_BFL_IMAGE_SMOKE",
    blockedReason: "PROVIDER_REMOVED",
    inventoryModelId: "flux-kontext-pro",
    wireModelId: "flux-kontext-pro",
  }),
  blockedImage({
    canonicalProviderId: "provider.midjourney",
    vendor: "midjourney",
    displayName: "Midjourney",
    baseUrl: "https://api.midjourney.com",
    credentialEnvVar: "MIDJOURNEY_API_KEY",
    enableEnvVar: "MIDJOURNEY_ENABLED",
    liveSmokeEnvVar: "RUN_LIVE_MIDJOURNEY_IMAGE_SMOKE",
    blockedReason: "NO_VERIFIED_FIRST_PARTY_PUBLIC_API",
    inventoryModelId: "midjourney-v7",
    wireModelId: "unverified",
  }),
  blockedImage({
    canonicalProviderId: "provider.hidream",
    vendor: "hidream",
    displayName: "HiDream",
    baseUrl: "https://api.hidream.ai",
    credentialEnvVar: "HIDREAM_API_KEY",
    enableEnvVar: "HIDREAM_ENABLED",
    liveSmokeEnvVar: "RUN_LIVE_HIDREAM_IMAGE_SMOKE",
    blockedReason: "API_CONTRACT_UNVERIFIED",
    inventoryModelId: "hidream-i1",
    wireModelId: "unverified",
  }),
  blockedImage({
    canonicalProviderId: "provider.reve",
    vendor: "reve",
    displayName: "Reve AI",
    baseUrl: "https://api.reve.ai",
    credentialEnvVar: "REVE_API_KEY",
    enableEnvVar: "REVE_ENABLED",
    liveSmokeEnvVar: "RUN_LIVE_REVE_IMAGE_SMOKE",
    blockedReason: "API_CONTRACT_UNVERIFIED",
    inventoryModelId: "reve-image",
    wireModelId: "unverified",
  }),
  blockedImage({
    canonicalProviderId: "provider.picsart",
    vendor: "picsart",
    displayName: "Picsart",
    baseUrl: "https://api.picsart.io",
    credentialEnvVar: "PICSART_API_KEY",
    enableEnvVar: "PICSART_ENABLED",
    liveSmokeEnvVar: "RUN_LIVE_PICSART_IMAGE_SMOKE",
    blockedReason: "API_CONTRACT_UNVERIFIED",
    inventoryModelId: "picsart",
    wireModelId: "unverified",
  }),
  blockedImage({
    canonicalProviderId: "provider.freepik",
    vendor: "freepik",
    displayName: "Freepik",
    baseUrl: "https://api.freepik.com",
    credentialEnvVar: "FREEPIK_API_KEY",
    enableEnvVar: "FREEPIK_ENABLED",
    liveSmokeEnvVar: "RUN_LIVE_FREEPIK_IMAGE_SMOKE",
    blockedReason: "API_CONTRACT_UNVERIFIED",
    inventoryModelId: "freepik",
    wireModelId: "unverified",
  }),
];

export const VERIFIED_IMAGE_PROVIDER_SPECS: readonly VerifiedImageProviderSpec[] = [
  IDEOGRAM_IMAGE_SPEC,
  RECRAFT_IMAGE_SPEC,
  GOOGLE_IMAGEN_SPEC,
];

export const ALL_IMAGE_PROVIDER_SPECS: readonly VerifiedImageProviderSpec[] = [
  ...VERIFIED_IMAGE_PROVIDER_SPECS,
  ...BLOCKED_IMAGE_PROVIDER_SPECS,
];
