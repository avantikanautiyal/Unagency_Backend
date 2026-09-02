/**
 * Track A Phase 0 — BrandContextPacket + budgets.
 * Binder (Phase A2) attaches this to execution; it must never become a prose novel.
 */

import type { BrandMemorySlotKey, BrandMemoryTier } from "./brand-memory-slots";
import {
  BRAND_CONTEXT_PACKET_BUDGETS,
  type BrandContextPacketBudgets,
} from "./continuity-budgets";

export const BRAND_CONTEXT_PACKET_SCHEMA_VERSION = "brand_context_packet.v0" as const;

export interface BrandContextAssetRef {
  readonly slot: BrandMemorySlotKey;
  readonly version: number;
  readonly assetId: string;
  readonly mimeType?: string;
  readonly role?: string;
}

export interface BrandContextFact {
  readonly key: string;
  readonly value: string;
  readonly tier: BrandMemoryTier;
  readonly provenance: string;
}

export interface BrandContextNegative {
  readonly text: string;
  readonly source: string;
}

/**
 * Hard inputs for thin generation: assets + short fact card + negatives.
 * L4: bind pixels/facts — do not narrate identity into the creative brief.
 */
export interface BrandContextPacket {
  readonly brandId: string;
  readonly schemaVersion: typeof BRAND_CONTEXT_PACKET_SCHEMA_VERSION;
  readonly assets: readonly BrandContextAssetRef[];
  readonly facts: readonly BrandContextFact[];
  readonly negatives: readonly BrandContextNegative[];
  /** One-line UI provenance, e.g. "Using Logo v3 (approved 2026-03-12)". */
  readonly provenanceLine: string;
  readonly budgets: BrandContextPacketBudgets;
  /** Required slots that could not be resolved — Intent/Resolver → ASK. */
  readonly missingRequiredSlots: readonly BrandMemorySlotKey[];
}

export type BrandContextPacketViolation =
  | "too_many_assets"
  | "too_many_facts"
  | "fact_card_too_long"
  | "missing_brand_id";

export function estimateFactCardTokens(
  facts: readonly BrandContextFact[],
  negatives: readonly BrandContextNegative[]
): number {
  // Rough heuristic: ~4 chars per token — budgets are hard caps, not model billing.
  const text = [
    ...facts.map((f) => `${f.key}:${f.value}`),
    ...negatives.map((n) => n.text),
  ].join("\n");
  return Math.ceil(text.length / 4);
}

export function validateBrandContextPacketBudgets(
  packet: Pick<
    BrandContextPacket,
    "brandId" | "assets" | "facts" | "negatives" | "budgets"
  >
): readonly BrandContextPacketViolation[] {
  const violations: BrandContextPacketViolation[] = [];
  if (!packet.brandId?.trim()) {
    violations.push("missing_brand_id");
  }
  const budgets = packet.budgets ?? BRAND_CONTEXT_PACKET_BUDGETS;
  if (packet.assets.length > budgets.maxAssets) {
    violations.push("too_many_assets");
  }
  if (packet.facts.length > budgets.maxFacts) {
    violations.push("too_many_facts");
  }
  if (estimateFactCardTokens(packet.facts, packet.negatives) > budgets.maxFactTokens) {
    violations.push("fact_card_too_long");
  }
  return violations;
}

/** Empty packet used in tests / unbound jobs — still budget-valid. */
export function emptyBrandContextPacket(
  brandId: string,
  budgets: BrandContextPacketBudgets = BRAND_CONTEXT_PACKET_BUDGETS
): BrandContextPacket {
  return {
    brandId,
    schemaVersion: BRAND_CONTEXT_PACKET_SCHEMA_VERSION,
    assets: [],
    facts: [],
    negatives: [],
    provenanceLine: "",
    budgets,
    missingRequiredSlots: [],
  };
}
