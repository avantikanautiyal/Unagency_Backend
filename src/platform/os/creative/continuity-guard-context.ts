/**
 * Track A Phase A3 — derive BrandGuard/SpecGuard inputs from BrandContextPacket.
 */

import type { BrandContextPacket } from "./brand-context-packet";

export interface ContinuityGuardContext {
  readonly brandId?: string;
  readonly continuityBound: boolean;
  readonly provenanceLine?: string;
  readonly brandVoice?: string;
  readonly brandTone?: string;
  readonly brandAvoidTerms: readonly string[];
  readonly boundLogoAssetId?: string;
  readonly boundAssetIds: readonly string[];
  readonly packet?: BrandContextPacket;
}

function isPacket(value: unknown): value is BrandContextPacket {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    typeof (value as BrandContextPacket).brandId === "string" &&
    Array.isArray((value as BrandContextPacket).assets)
  );
}

export function extractContinuityGuardContext(
  metadata: Readonly<Record<string, unknown>> | undefined
): ContinuityGuardContext {
  const packet = isPacket(metadata?.brandContextPacket)
    ? metadata!.brandContextPacket
    : undefined;

  const avoidFromNegatives =
    packet?.negatives.map((n) => n.text.trim()).filter((t) => t.length >= 2) ??
    [];
  const avoidFromFacts =
    packet?.facts
      .filter((f) => /avoid|forbidden|never/i.test(f.key))
      .map((f) => f.value.trim())
      .filter((t) => t.length >= 2) ?? [];

  const voiceFact = packet?.facts.find((f) => /voice|tone/i.test(f.key));
  const logo = packet?.assets.find(
    (a) => a.slot === "logo" || a.slot === "wordmark" || a.slot === "icon"
  );

  return {
    brandId: packet?.brandId,
    continuityBound: metadata?.continuityBound === true,
    provenanceLine:
      typeof metadata?.brandContextProvenance === "string"
        ? metadata.brandContextProvenance
        : packet?.provenanceLine,
    brandVoice: voiceFact?.value,
    brandTone: voiceFact?.value,
    brandAvoidTerms: [...new Set([...avoidFromNegatives, ...avoidFromFacts])],
    boundLogoAssetId: logo?.assetId,
    boundAssetIds: packet?.assets.map((a) => a.assetId) ?? [],
    packet,
  };
}
