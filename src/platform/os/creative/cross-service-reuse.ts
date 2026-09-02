/**
 * Track A Phase A5 — cross-service continuity carry slots.
 * logo → guidelines → social → ads → web (optional slots; never invent).
 */

import type { BrandMemorySlotKey } from "./brand-memory-slots";

export type ContinuityServiceSlug =
  | "logo"
  | "guidelines"
  | "social"
  | "ads"
  | "website"
  | "packaging"
  | "presentation"
  | (string & {});

/** Slots typically carried into a service when prior brand identity exists. */
export const CROSS_SERVICE_CARRY_SLOTS: Readonly<
  Record<string, readonly BrandMemorySlotKey[]>
> = Object.freeze({
  logo: ["logo", "wordmark", "colors"],
  guidelines: ["logo", "wordmark", "colors", "type", "voice", "negatives"],
  social: ["logo", "colors", "voice", "campaignLook", "productHero"],
  ads: ["logo", "colors", "voice", "campaignLook", "productHero"],
  website: ["logo", "wordmark", "colors", "type", "voice"],
  packaging: ["logo", "colors", "productHero"],
  presentation: ["logo", "colors", "type", "voice"],
});

const SERVICE_ALIASES: Readonly<Record<string, string>> = {
  brand: "guidelines",
  identity: "logo",
  branding: "guidelines",
  social_media: "social",
  instagram: "social",
  facebook: "social",
  linkedin: "social",
  advertising: "ads",
  ad: "ads",
  web: "website",
  webtech: "website",
  ppt: "presentation",
  deck: "presentation",
};

export function normalizeContinuityService(
  service: string | undefined
): string | undefined {
  if (!service?.trim()) return undefined;
  const raw = service.trim().toLowerCase();
  return SERVICE_ALIASES[raw] ?? raw;
}

/**
 * Optional slots to attempt when creating in `service`, given prior identity.
 * Required slots stay under Intent Gate — this only adds optional carry.
 */
export function crossServiceOptionalSlots(
  service: string | undefined
): readonly BrandMemorySlotKey[] {
  const key = normalizeContinuityService(service);
  if (!key) return [];
  return CROSS_SERVICE_CARRY_SLOTS[key] ?? ["logo", "colors"];
}

/** Ordered reuse path for docs / observability. */
export const CROSS_SERVICE_REUSE_PATH = Object.freeze([
  "logo",
  "guidelines",
  "social",
  "ads",
  "website",
] as const);
