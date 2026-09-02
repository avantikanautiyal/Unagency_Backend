/**
 * Satisfy required Brand Memory slots when the brand profile or prompt already
 * carries logo / voice (mirrors inline colour satisfaction).
 */

import type { BrandContextAssetRef, BrandContextFact } from "../platform/os/creative/brand-context-packet";
import type { BrandMemorySlotKey } from "../platform/os/creative/brand-memory-slots";
import type { KnowledgeResolveResult } from "../platform/os/creative/knowledge-resolver";

function metadataString(
  metadata: Readonly<Record<string, unknown>> | undefined,
  key: string
): string {
  const raw = metadata?.[key];
  return typeof raw === "string" ? raw.trim() : "";
}

function metadataAssetIds(
  metadata: Readonly<Record<string, unknown>> | undefined
): string[] {
  const raw = metadata?.assetIds;
  if (Array.isArray(raw)) {
    return raw.map(String).map((s) => s.trim()).filter(Boolean);
  }
  const single = metadataString(metadata, "assetIds");
  return single ? [single] : [];
}

function resolveInlineLogoAssetId(input: {
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly profileLogoAssetId?: string;
}): { assetId: string; provenance: string } | null {
  const profileId = input.profileLogoAssetId?.trim();
  if (profileId) {
    return { assetId: profileId, provenance: "Brand profile logo" };
  }

  const metaLogo =
    metadataString(input.metadata, "vaultLogoChoice") ||
    metadataString(input.metadata, "brandLogoAssetId") ||
    metadataString(input.metadata, "logoAssetId");
  if (metaLogo) {
    return { assetId: metaLogo, provenance: "Brand profile logo" };
  }

  const attached = metadataAssetIds(input.metadata);
  if (attached.length) {
    return { assetId: attached[0]!, provenance: "Prompt attachment" };
  }

  return null;
}

function voiceFactValue(facts: readonly BrandContextFact[]): string {
  const voice = facts.find((f) => f.key === "voice")?.value?.trim();
  if (voice) return voice;
  return "";
}

function resolveInlineVoice(input: {
  readonly facts: readonly BrandContextFact[];
  readonly metadata?: Readonly<Record<string, unknown>>;
}): string {
  const fromFacts = voiceFactValue(input.facts);
  if (fromFacts) return fromFacts;
  return metadataString(input.metadata, "brandTone");
}

export function applyProfileAndMetadataSlotSatisfaction(input: {
  readonly resolve: KnowledgeResolveResult;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly profileLogoAssetId?: string;
}): KnowledgeResolveResult {
  let missingRequiredSlots: BrandMemorySlotKey[] = [
    ...input.resolve.missingRequiredSlots,
  ];
  let assets: BrandContextAssetRef[] = [...input.resolve.assets];
  let facts: BrandContextFact[] = [...input.resolve.facts];
  let provenanceParts = [...input.resolve.provenanceParts];

  if (missingRequiredSlots.includes("logo")) {
    const inlineLogo = resolveInlineLogoAssetId({
      metadata: input.metadata,
      profileLogoAssetId: input.profileLogoAssetId,
    });
    if (inlineLogo) {
      missingRequiredSlots = missingRequiredSlots.filter((s) => s !== "logo");
      if (!assets.some((a) => a.slot === "logo")) {
        assets.push({
          slot: "logo",
          version: 1,
          assetId: inlineLogo.assetId,
          role: "logo",
        });
      }
      if (!provenanceParts.includes(inlineLogo.provenance)) {
        provenanceParts = [...provenanceParts, inlineLogo.provenance];
      }
    }
  }

  if (missingRequiredSlots.includes("voice")) {
    const voice = resolveInlineVoice({
      facts,
      metadata: input.metadata,
    });
    if (voice) {
      missingRequiredSlots = missingRequiredSlots.filter((s) => s !== "voice");
      if (!facts.some((f) => f.key === "voice")) {
        facts.push({
          key: "voice",
          value: voice,
          tier: "canonical",
          provenance: "Brand profile",
        });
      }
      if (!provenanceParts.includes("Brand profile")) {
        provenanceParts = [...provenanceParts, "Brand profile"];
      }
    }
  }

  return {
    ...input.resolve,
    missingRequiredSlots,
    assets,
    facts,
    provenanceParts,
  };
}
