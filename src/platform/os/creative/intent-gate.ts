/**
 * Track A Phase 0 — Intent Gate contracts.
 * Maps structured logoRole / service prior → continuity tags.
 * Must not rewrite the brief (L1). Must not regex the brief for logo create vs reuse.
 */

import type { BrandMemorySlotKey } from "./brand-memory-slots";
import {
  logoRoleFromMetadata,
  type CreativeLogoRole,
} from "./creative-intent-classifier";

export const INTENT_GATE_TAGS = [
  "reuse_logo",
  "reuse_wordmark",
  "reuse_colors",
  "reuse_type",
  "reuse_voice",
  "reuse_product_hero",
  "match_campaign",
  "new_mark",
  "ignore_old_logo",
  "unspecified",
] as const;

export type IntentGateTag = (typeof INTENT_GATE_TAGS)[number] | (string & {});

/**
 * Invariant: briefUnchanged is always true for production Intent Gate.
 * Any implementation that mutates the user brief violates L1.
 */
export interface IntentGateResult {
  readonly intentTags: readonly IntentGateTag[];
  readonly requiredSlots: readonly BrandMemorySlotKey[];
  readonly optionalSlots: readonly BrandMemorySlotKey[];
  readonly briefUnchanged: true;
}

export type IntentGateContext = {
  readonly service?: string;
  readonly subtype?: string;
  /** Structured logo role from creative-intent-classifier (preferred). */
  readonly logoRole?: CreativeLogoRole;
  readonly metadata?: Readonly<Record<string, unknown>>;
};

function isLogoDesignService(context?: IntentGateContext): boolean {
  const service = (context?.service ?? "").trim().toLowerCase();
  const subtype = (context?.subtype ?? "").trim().toLowerCase();
  if (service === "branding" && /logo/.test(subtype)) return true;
  if (service === "branding" && !subtype) return false;
  return /logo-design|logo_design/.test(subtype);
}

function resolveLogoRole(context?: IntentGateContext): CreativeLogoRole | undefined {
  if (context?.logoRole) return context.logoRole;
  return logoRoleFromMetadata(context?.metadata);
}

/**
 * Intent Gate — structured logoRole + service prior.
 * Brief text is accepted for API compatibility but is not pattern-matched for logo intent.
 */
export function detectIntentGateFromBrief(
  _brief: string,
  context?: IntentGateContext
): IntentGateResult {
  const intentTags: IntentGateTag[] = [];
  const requiredSlots: BrandMemorySlotKey[] = [];
  const optionalSlots: BrandMemorySlotKey[] = [];

  const logoRole = resolveLogoRole(context);
  const logoDesignJob = isLogoDesignService(context);

  if (logoRole === "create_new" || (!logoRole && logoDesignJob)) {
    intentTags.push("new_mark");
  } else if (
    logoRole === "reuse_canonical" ||
    logoRole === "reuse_attached"
  ) {
    intentTags.push("reuse_logo");
    requiredSlots.push("logo");
  }

  if (intentTags.length === 0) {
    intentTags.push("unspecified");
  }

  return {
    intentTags: [...new Set(intentTags)],
    requiredSlots: [...new Set(requiredSlots)],
    optionalSlots: [...new Set(optionalSlots)].filter(
      (s) => !requiredSlots.includes(s)
    ),
    briefUnchanged: true,
  };
}
