/**
 * Track A Phase A2 — Context Binder.
 * Compiles BrandContextPacket and attaches hard inputs to metadata.
 * Must not rewrite the creative brief (L1/L4).
 */

import {
  BRAND_CONTEXT_PACKET_BUDGETS,
  BRAND_CONTEXT_PACKET_SCHEMA_VERSION,
  emptyBrandContextPacket,
  validateBrandContextPacketBudgets,
  type BrandContextPacket,
} from "./brand-context-packet";
import type { KnowledgeResolveResult } from "./knowledge-resolver";

export interface BindBrandContextInput {
  readonly brandId: string;
  readonly resolve: KnowledgeResolveResult;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface BindBrandContextResult {
  readonly packet: BrandContextPacket;
  readonly metadata: Record<string, unknown>;
  readonly budgetOk: boolean;
  /** True when required slots are missing — caller should ASK, not invent. */
  readonly needsAsk: boolean;
}

function trimToBudgets(packet: BrandContextPacket): BrandContextPacket {
  const budgets = packet.budgets;
  return {
    ...packet,
    assets: packet.assets.slice(0, budgets.maxAssets),
    facts: packet.facts.slice(0, budgets.maxFacts),
    negatives: packet.negatives.slice(0, budgets.maxFacts),
  };
}

export function buildBrandContextPacket(input: {
  readonly brandId: string;
  readonly resolve: KnowledgeResolveResult;
}): BrandContextPacket {
  const base = emptyBrandContextPacket(input.brandId, BRAND_CONTEXT_PACKET_BUDGETS);
  const provenanceLine = input.resolve.provenanceParts.filter(Boolean).join(" · ");
  const packet: BrandContextPacket = {
    ...base,
    assets: input.resolve.assets,
    facts: input.resolve.facts,
    negatives: input.resolve.negatives,
    provenanceLine,
    missingRequiredSlots: input.resolve.missingRequiredSlots,
  };
  return trimToBudgets(packet);
}

/**
 * Attach packet to metadata as hard inputs (assetIds + structured packet).
 * Does not touch `prompt` / enrichedPrompt.
 */
export function bindBrandContextPacketToMetadata(
  input: BindBrandContextInput
): BindBrandContextResult {
  const packet = buildBrandContextPacket({
    brandId: input.brandId,
    resolve: input.resolve,
  });
  const violations = validateBrandContextPacketBudgets(packet);
  const needsAsk = packet.missingRequiredSlots.length > 0;

  const metadata: Record<string, unknown> = { ...(input.metadata ?? {}) };
  metadata.brandContextPacket = packet;
  metadata.brandContextProvenance = packet.provenanceLine;
  metadata.continuityBound = !needsAsk && packet.assets.length + packet.facts.length > 0;
  metadata.continuityNeedsAsk = needsAsk;
  if (needsAsk) {
    metadata.missingRequiredSlots = [...packet.missingRequiredSlots];
  }

  const existingIds = Array.isArray(metadata.assetIds)
    ? metadata.assetIds.map(String).filter(Boolean)
    : typeof metadata.assetIds === "string" && metadata.assetIds.trim()
      ? [metadata.assetIds.trim()]
      : [];
  const boundIds = packet.assets.map((a) => a.assetId);
  metadata.assetIds = [...new Set([...existingIds, ...boundIds])];

  // Prefer first logo-like asset as image hint for vision/image providers.
  const logo = packet.assets.find(
    (a) => a.slot === "logo" || a.slot === "wordmark" || a.slot === "icon"
  );
  if (logo && !metadata.brandLogoAssetId) {
    metadata.brandLogoAssetId = logo.assetId;
  }

  return {
    packet,
    metadata,
    budgetOk: violations.length === 0,
    needsAsk,
  };
}

export function attachShadowBrandContextPacket(
  metadata: Readonly<Record<string, unknown>> | undefined,
  packet: BrandContextPacket
): Record<string, unknown> {
  return {
    ...(metadata ?? {}),
    brandContextPacketShadow: packet,
    brandContextProvenanceShadow: packet.provenanceLine,
    continuityShadow: true,
  };
}

export { BRAND_CONTEXT_PACKET_SCHEMA_VERSION };
