/**
 * Visual verification capability registry.
 * Distinct from image *generation* capabilities (TEXT_TO_IMAGE, ON_ASSET_TEXT, …).
 *
 * OCR_TEXT_RECOGNITION becomes declared/verified only when a real producer
 * is registered — never inferred from image-generation success.
 */

import type { VisualVerificationCapabilityId } from "./visual-verification-requirements";

export type VisualVerificationCapabilityClaim =
  | "verified"
  | "declared"
  | "inferred"
  | "unsupported"
  | "undeclared";

export type VisualVerificationCapabilityProfile = Readonly<{
  readonly capabilityId: VisualVerificationCapabilityId;
  readonly claim: VisualVerificationCapabilityClaim;
  readonly notes: string;
}>;

type MutableClaim = {
  claim: VisualVerificationCapabilityClaim;
  notes: string;
};

const claims: Record<VisualVerificationCapabilityId, MutableClaim> = {
  OCR_TEXT_RECOGNITION: {
    claim: "undeclared",
    notes:
      "no classical OCR producer registered (knowledge.ocr remains a no-op hook)",
  },
  VISION_IMAGE_ANALYSIS: {
    claim: "undeclared",
    notes:
      "vision.analyze exists for LLM multimodal chat but is not registered as a structural verification producer",
  },
  VISION_LAYOUT_ANALYSIS: {
    claim: "undeclared",
    notes: "no layout / hierarchy pixel analyzer registered",
  },
  VISION_BRAND_MARK_DETECTION: {
    claim: "undeclared",
    notes: "no brand-mark pixel detector registered",
  },
  COMPOSITION_LAYER_EVIDENCE: {
    claim: "declared",
    notes:
      "deterministic composition layer evidence satisfies brand/visual/layout criteria when present",
  },
};

const CAPABILITY_ORDER: readonly VisualVerificationCapabilityId[] = [
  "OCR_TEXT_RECOGNITION",
  "VISION_IMAGE_ANALYSIS",
  "VISION_LAYOUT_ANALYSIS",
  "VISION_BRAND_MARK_DETECTION",
  "COMPOSITION_LAYER_EVIDENCE",
];

/** Live snapshot — prefer getPlatformVisualVerificationCapabilities(). */
export function getPlatformVisualVerificationCapabilities(): readonly VisualVerificationCapabilityProfile[] {
  return Object.freeze(
    CAPABILITY_ORDER.map((capabilityId) =>
      Object.freeze({
        capabilityId,
        claim: claims[capabilityId].claim,
        notes: claims[capabilityId].notes,
      }),
    ),
  );
}

/**
 * Live-updating array-like export for callers that import the constant.
 * Prefer getPlatformVisualVerificationCapabilities().
 */
export const PLATFORM_VISUAL_VERIFICATION_CAPABILITIES: readonly VisualVerificationCapabilityProfile[] =
  new Proxy([] as VisualVerificationCapabilityProfile[], {
    get(_target, prop) {
      const live = getPlatformVisualVerificationCapabilities() as unknown as Record<
        PropertyKey,
        unknown
      > &
        VisualVerificationCapabilityProfile[];
      const value = live[prop as keyof typeof live];
      if (typeof value === "function") {
        return (value as (...args: unknown[]) => unknown).bind(live);
      }
      return value;
    },
    ownKeys() {
      return Reflect.ownKeys(getPlatformVisualVerificationCapabilities());
    },
    getOwnPropertyDescriptor(_target, prop) {
      return Object.getOwnPropertyDescriptor(
        getPlatformVisualVerificationCapabilities(),
        prop,
      );
    },
  });

/**
 * Register evidence-backed claim for a verification capability.
 * Does not accept generation-provider identity as semantic input.
 */
export function setVisualVerificationCapabilityClaim(input: {
  readonly capabilityId: VisualVerificationCapabilityId;
  readonly claim: VisualVerificationCapabilityClaim;
  readonly notes: string;
}): void {
  claims[input.capabilityId] = {
    claim: input.claim,
    notes: input.notes,
  };
}

export function resetVisualVerificationCapabilityClaimsForTests(): void {
  claims.OCR_TEXT_RECOGNITION = {
    claim: "undeclared",
    notes:
      "no classical OCR producer registered (knowledge.ocr remains a no-op hook)",
  };
  claims.VISION_IMAGE_ANALYSIS = {
    claim: "undeclared",
    notes:
      "vision.analyze exists for LLM multimodal chat but is not registered as a structural verification producer",
  };
  claims.VISION_LAYOUT_ANALYSIS = {
    claim: "undeclared",
    notes: "no layout / hierarchy pixel analyzer registered",
  };
  claims.VISION_BRAND_MARK_DETECTION = {
    claim: "undeclared",
    notes: "no brand-mark pixel detector registered",
  };
  claims.COMPOSITION_LAYER_EVIDENCE = {
    claim: "declared",
    notes:
      "deterministic composition layer evidence satisfies brand/visual/layout criteria when present",
  };
}

export function claimForVisualVerificationCapability(
  capabilityId: VisualVerificationCapabilityId,
): VisualVerificationCapabilityClaim {
  return claims[capabilityId]?.claim ?? "undeclared";
}

export function platformHasVisualVerificationCapability(
  capabilityId: VisualVerificationCapabilityId,
): boolean {
  const claim = claimForVisualVerificationCapability(capabilityId);
  return claim === "verified" || claim === "declared";
}

/**
 * True when at least one capability that can satisfy the criterion is available.
 */
export function canSatisfyVerificationCriterion(input: {
  readonly satisfiedBy: readonly VisualVerificationCapabilityId[];
}): boolean {
  return input.satisfiedBy.some((id) =>
    platformHasVisualVerificationCapability(id),
  );
}
