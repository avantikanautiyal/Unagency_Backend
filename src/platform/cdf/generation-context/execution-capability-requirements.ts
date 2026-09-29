/**
 * Derive provider execution capability requirements from DeliverableCompositionContract.
 * Composition remains source of truth — routing consumes this projection only.
 * No serviceId / phaseId / platform / provider branches.
 */

import type { DeliverableCompositionContract } from "../../../../../Unagency-frontend/packages/api/src/domain/cdf/deliverable-composition";
import type { ImageProviderCapabilityFlag } from "../../providers/image/configs/image-provider-capabilities";

/** Hard requirements filter providers; soft preferences only rank survivors. */
export type ExecutionCapabilityRequirements = {
  readonly hardCapabilities: readonly ImageProviderCapabilityFlag[];
  readonly softPreferences: {
    /** Prefer providers that declare ON_ASSET_TEXT when any do. */
    readonly preferOnAssetTextCapable: boolean;
    /** Prefer reference-capable providers when identity/brand mark participates. */
    readonly preferReferenceCapable: boolean;
  };
  readonly derivedFrom: {
    readonly deliverableKind: string;
    readonly communicationMode: string;
    readonly textPolicyRequired: boolean;
    readonly textPlacement: string | null;
    readonly hierarchyDefined: boolean;
    readonly brandMarkRole: string | null;
  };
};

const ON_ASSET_PLACEMENTS = new Set(["on_asset", "optional_on_asset"]);

/**
 * Map composition contract → hard/soft execution requirements.
 * Does not invent Instagram/social/provider semantics.
 */
export function deriveExecutionCapabilityRequirements(
  contract: DeliverableCompositionContract | null | undefined,
): ExecutionCapabilityRequirements | null {
  if (!contract) return null;

  const textRequired = contract.textPolicy?.required === true;
  const placement = contract.textPolicy?.placement ?? null;
  const onAssetTextHard =
    textRequired && placement != null && ON_ASSET_PLACEMENTS.has(placement);

  const hierarchyDefined =
    Array.isArray(contract.hierarchy) && contract.hierarchy.length > 0;

  const brandMarkRole = contract.brandIntegration?.markRole ?? null;
  const brandNeedsReference =
    brandMarkRole === "signature" ||
    brandMarkRole === "secondary" ||
    brandMarkRole === "primary" ||
    contract.requiredElements.includes("brand_signature") ||
    contract.requiredElements.includes("identity_mark");

  const hard: ImageProviderCapabilityFlag[] = ["TEXT_TO_IMAGE"];
  // ON_ASSET_TEXT is hard only when the composition requires on-asset text.
  // Providers that do not declare it are filtered only when ≥1 executable declares it
  // (see filterProvidersByHardCapabilities).
  if (onAssetTextHard) {
    hard.push("ON_ASSET_TEXT");
  }
  if (brandNeedsReference) {
    hard.push("REFERENCE_IMAGE");
  }

  return Object.freeze({
    hardCapabilities: Object.freeze(hard),
    softPreferences: Object.freeze({
      preferOnAssetTextCapable: onAssetTextHard,
      preferReferenceCapable: brandNeedsReference,
    }),
    derivedFrom: Object.freeze({
      deliverableKind: contract.kind,
      communicationMode: contract.communicationMode,
      textPolicyRequired: textRequired,
      textPlacement: placement,
      hierarchyDefined,
      brandMarkRole,
    }),
  });
}

/**
 * Filter provider ids by hard capabilities.
 *
 * UNDECLARED HARD CAPABILITY POLICY (explicit):
 *   degrade_to_soft — if zero candidates declare a hard capability, do NOT
 *   empty the set and do NOT invent the capability. Keep candidates and rely
 *   on soft ranking / matrix preferences. Undeclared ≠ proven inability.
 *
 * Never silently pretend ON_ASSET_TEXT (or other undeclared caps) exists.
 */
export const UNDECLARED_HARD_CAPABILITY_POLICY = "degrade_to_soft" as const;

export function filterProvidersByHardCapabilities(input: {
  readonly providerIds: readonly string[];
  readonly hardCapabilities: readonly ImageProviderCapabilityFlag[];
  readonly providerHasCapability: (
    providerId: string,
    capability: ImageProviderCapabilityFlag,
  ) => boolean;
}): readonly string[] {
  let remaining = [...input.providerIds];
  for (const cap of input.hardCapabilities) {
    if (cap === "TEXT_TO_IMAGE") {
      // Modality-layer assumption for image.generate executables (inferred).
      continue;
    }
    const matching = remaining.filter((id) =>
      input.providerHasCapability(id, cap),
    );
    if (matching.length > 0) {
      remaining = matching;
    }
    // else: undeclared across the set → degrade_to_soft (keep remaining)
  }
  return Object.freeze(remaining);
}

/**
 * Soft-rank: stable preference order with optional ON_ASSET_TEXT / REFERENCE boosts.
 * Does not invent a new matrix — reorders an existing preference list.
 */
export function softRankProviderPreferences<
  T extends { readonly providerId: string },
>(input: {
  readonly preferences: readonly T[];
  readonly soft: ExecutionCapabilityRequirements["softPreferences"];
  readonly providerHasCapability: (
    providerId: string,
    capability: ImageProviderCapabilityFlag,
  ) => boolean;
}): readonly T[] {
  const score = (providerId: string): number => {
    let s = 0;
    if (
      input.soft.preferOnAssetTextCapable &&
      input.providerHasCapability(providerId, "ON_ASSET_TEXT")
    ) {
      s += 2;
    }
    if (
      input.soft.preferReferenceCapable &&
      input.providerHasCapability(providerId, "REFERENCE_IMAGE")
    ) {
      s += 1;
    }
    return s;
  };
  return Object.freeze(
    [...input.preferences].sort((a, b) => {
      const d = score(b.providerId) - score(a.providerId);
      if (d !== 0) return d;
      return 0; // preserve relative order among equal scores
    }),
  );
}
