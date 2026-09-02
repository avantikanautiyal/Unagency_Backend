/**
 * Track A Phase A2 — Knowledge Resolver.
 * Slots first from Brand Memory. Never invents missing brand truth.
 */

import type {
  BrandContextAssetRef,
  BrandContextFact,
  BrandContextNegative,
} from "./brand-context-packet";
import type { BrandMemorySlotEntry, BrandMemorySlotKey } from "./brand-memory-slots";
import {
  defaultBrandMemoryStore,
  type IBrandMemoryStore,
} from "./brand-memory-store";
import type { IntentGateResult } from "./intent-gate";

const VISUAL_SLOTS = new Set<string>([
  "logo",
  "wordmark",
  "icon",
  "productHero",
  "campaignLook",
]);

export interface ResolvedBrandSlot {
  readonly slotKey: BrandMemorySlotKey;
  readonly entry: BrandMemorySlotEntry;
}

export interface KnowledgeResolveResult {
  readonly resolved: readonly ResolvedBrandSlot[];
  readonly missingRequiredSlots: readonly BrandMemorySlotKey[];
  readonly assets: readonly BrandContextAssetRef[];
  readonly facts: readonly BrandContextFact[];
  readonly negatives: readonly BrandContextNegative[];
  readonly provenanceParts: readonly string[];
}

function pickEntry(
  canonical: BrandMemorySlotEntry | undefined,
  working: BrandMemorySlotEntry | undefined,
  preferWorking: boolean
): BrandMemorySlotEntry | undefined {
  if (preferWorking) return working ?? canonical;
  return canonical ?? working;
}

function factsFromEntry(entry: BrandMemorySlotEntry): BrandContextFact[] {
  const out: BrandContextFact[] = [];
  const raw = entry.facts ?? {};
  for (const [key, value] of Object.entries(raw)) {
    if (Array.isArray(value)) {
      const joined = value.map(String).filter(Boolean).join(", ");
      if (!joined) continue;
      out.push({
        key,
        value: joined,
        tier: entry.tier === "archive" ? "working" : entry.tier,
        provenance: entry.provenance,
      });
    } else if (typeof value === "string" && value.trim()) {
      out.push({
        key,
        value: value.trim(),
        tier: entry.tier === "archive" ? "working" : entry.tier,
        provenance: entry.provenance,
      });
    }
  }
  return out;
}

export class BrandKnowledgeResolver {
  constructor(private readonly store: IBrandMemoryStore = defaultBrandMemoryStore) {}

  async resolve(input: {
    readonly brandId: string;
    readonly organizationId: string;
    readonly intent: IntentGateResult;
    /** Phase A5 — when matching a campaign, prefer Working campaignLook. */
    readonly preferWorkingCampaignLook?: boolean;
    /** Extra optional slots (e.g. cross-service carry). */
    readonly extraOptionalSlots?: readonly BrandMemorySlotKey[];
  }): Promise<KnowledgeResolveResult> {
    const preferCampaign =
      input.preferWorkingCampaignLook === true ||
      input.intent.intentTags.includes("match_campaign");

    const slotsToFetch = [
      ...new Set([
        ...input.intent.requiredSlots,
        ...input.intent.optionalSlots,
        ...(input.extraOptionalSlots ?? []),
      ]),
    ];
    const resolved: ResolvedBrandSlot[] = [];
    const missingRequiredSlots: BrandMemorySlotKey[] = [];
    const assets: BrandContextAssetRef[] = [];
    const facts: BrandContextFact[] = [];
    const negatives: BrandContextNegative[] = [];
    const provenanceParts: string[] = [];

    for (const slotKey of slotsToFetch) {
      const canonical = await this.store.getCanonical(
        input.brandId,
        input.organizationId,
        slotKey
      );
      const working = await this.store.getWorking(
        input.brandId,
        input.organizationId,
        slotKey
      );
      const preferWorking =
        preferCampaign && String(slotKey) === "campaignLook";
      const entry = pickEntry(canonical, working, preferWorking);
      const required = input.intent.requiredSlots.includes(slotKey);

      if (!entry) {
        if (required) missingRequiredSlots.push(slotKey);
        continue;
      }

      resolved.push({ slotKey, entry });
      provenanceParts.push(entry.provenance);

      if (VISUAL_SLOTS.has(String(slotKey)) && entry.assetId) {
        assets.push({
          slot: slotKey,
          version: entry.version,
          assetId: entry.assetId,
          role: String(slotKey),
        });
      }

      if (String(slotKey) === "negatives") {
        for (const f of factsFromEntry(entry)) {
          negatives.push({ text: f.value, source: f.provenance });
        }
      } else {
        const extracted = factsFromEntry(entry);
        facts.push(...extracted);
      }
    }

    return {
      resolved,
      missingRequiredSlots,
      assets,
      facts,
      negatives,
      provenanceParts,
    };
  }
}

export const defaultBrandKnowledgeResolver = new BrandKnowledgeResolver();
