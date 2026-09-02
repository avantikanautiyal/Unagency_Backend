/**
 * Track A Phase 0 — Brand Memory slot contracts.
 * Types only: no persistence / create-path wiring yet (Phase A1).
 *
 * @see docs/CREATIVE_INTELLIGENCE_OS_PHASED_ROADMAP.md
 */

export const BRAND_MEMORY_SLOT_KEYS = [
  "logo",
  "wordmark",
  "icon",
  "colors",
  "type",
  "voice",
  "photographyStyle",
  "productHero",
  "campaignLook",
  "negatives",
] as const;

export type BrandMemorySlotKey = (typeof BRAND_MEMORY_SLOT_KEYS)[number] | (string & {});

export type BrandMemoryTier = "canonical" | "working" | "archive";

export type BrandMemorySourceKind =
  | "upload"
  | "approval"
  | "guidelines"
  | "import"
  | "manual";

export interface BrandMemorySource {
  readonly kind: BrandMemorySourceKind;
  readonly refId?: string;
  readonly at: string;
}

/**
 * One versioned entry in a brand memory slot.
 * Assets point at product-asset / artifact IDs — no parallel blob world.
 */
export interface BrandMemorySlotEntry {
  readonly brandId: string;
  readonly organizationId: string;
  readonly slotKey: BrandMemorySlotKey;
  readonly tier: BrandMemoryTier;
  readonly version: number;
  /** ProductAsset or OS artifact id when the slot is visual. */
  readonly assetId?: string;
  /** Short structured facts (colors, voice line, forbidden words). */
  readonly facts?: Readonly<Record<string, string | readonly string[]>>;
  readonly source: BrandMemorySource;
  /** Human-readable provenance for UI. */
  readonly provenance: string;
  readonly createdAt: string;
  readonly supersededAt?: string;
}

export function isKnownBrandMemorySlotKey(key: string): boolean {
  return (BRAND_MEMORY_SLOT_KEYS as readonly string[]).includes(key);
}
