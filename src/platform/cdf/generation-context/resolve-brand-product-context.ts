/**
 * Project authorized brand / product grounding into generation intent.
 * Reads already-bound execution metadata — no serviceId branches.
 *
 * Identity authority:
 *   selected brandId + persisted/selected brand name = ownership
 *   prompt extraction = enrichment / referenced entities only
 */

import {
  isBrandFactRelevantForProjection,
  type BrandFactProjectionContext,
} from "./brand-fact-relevance";
import type {
  CanonicalBrandContext,
  CanonicalProductGrounding,
} from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function readString(
  meta: Readonly<Record<string, unknown>>,
  key: string,
): string | undefined {
  const v = meta[key];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function readStringArray(
  meta: Readonly<Record<string, unknown>>,
  key: string,
): string[] {
  const v = meta[key];
  if (!Array.isArray(v)) return [];
  return v
    .filter((c): c is string => typeof c === "string" && Boolean(c.trim()))
    .map((c) => c.trim());
}

export type BrandIdentityProjectionDiagnostics = {
  readonly selectedBrandId?: string;
  readonly selectedCanonicalBrandName?: string;
  readonly extractedBrandEntities: readonly string[];
  readonly extractionAttemptedIdentityMutation: boolean;
};

/**
 * Detect whether prompt extraction tried (or still holds) an identity-shaped
 * brandName that differs from the selected brand's canonical name.
 */
export function inspectBrandIdentityAuthority(
  metadata: Readonly<Record<string, unknown>>,
): BrandIdentityProjectionDiagnostics {
  const selectedBrandId = readString(metadata, "brandId");
  const selectedCanonicalBrandName =
    readString(metadata, "canonicalBrandName") ||
    readString(metadata, "brandName");
  const extracted = [
    ...readStringArray(metadata, "extractedBrandEntities"),
    ...readStringArray(metadata, "promptReferencedBrandNames"),
  ];
  const extractedName = readString(metadata, "extractedBrandName");
  if (extractedName && !extracted.includes(extractedName)) {
    extracted.push(extractedName);
  }
  const mutationFlag = metadata.brandExtractAttemptedIdentityMutation === true;
  const extractSource = readString(metadata, "brandExtractSource");
  const nameLooksExtracted =
    Boolean(extractSource) &&
    Boolean(selectedCanonicalBrandName) &&
    extracted.some(
      (e) =>
        e.toLowerCase() !== selectedCanonicalBrandName!.toLowerCase() &&
        selectedCanonicalBrandName!.toLowerCase() !== e.toLowerCase(),
    );
  return {
    ...(selectedBrandId ? { selectedBrandId } : {}),
    ...(selectedCanonicalBrandName
      ? { selectedCanonicalBrandName }
      : {}),
    extractedBrandEntities: Object.freeze([...new Set(extracted)]),
    extractionAttemptedIdentityMutation: mutationFlag || nameLooksExtracted,
  };
}

/**
 * Prefer BrandContextPacket when present; fall back to flat brand masters
 * already stamped on metadata (brandName / brandColors / tone).
 *
 * When projectionCtx is provided, facts are filtered by declarative relevance
 * (modality / uxType / intent tags) — never by serviceId or phaseId.
 */
export function resolveCanonicalBrandContextFromMetadata(
  metadata: Readonly<Record<string, unknown>>,
  projectionCtx?: BrandFactProjectionContext,
): CanonicalBrandContext | undefined {
  const identity = inspectBrandIdentityAuthority(metadata);
  const selectedBrandId = identity.selectedBrandId;
  const canonicalName = identity.selectedCanonicalBrandName;

  const packet = metadata.brandContextPacket;
  if (isRecord(packet)) {
    const brandId =
      (typeof packet.brandId === "string" && packet.brandId.trim()) ||
      selectedBrandId ||
      "";
    if (!brandId) return undefined;
    // Selected brandId is authoritative ownership — packet must not switch it.
    const authoritativeBrandId = selectedBrandId || brandId;
    const factsRaw = Array.isArray(packet.facts) ? packet.facts : [];
    const facts: CanonicalBrandContext["facts"] = [];
    for (const f of factsRaw) {
      if (!isRecord(f)) continue;
      const key = typeof f.key === "string" ? f.key.trim() : "";
      const value = typeof f.value === "string" ? f.value.trim() : "";
      if (!key || !value) continue;
      if (key === "brandName" && canonicalName) {
        // Never let packet/extracted name replace selected canonical name.
        facts.push({
          key: "brandName",
          value: canonicalName,
          ...(typeof f.tier === "string" ? { tier: f.tier } : {}),
          provenance:
            typeof f.provenance === "string" && f.provenance.trim()
              ? f.provenance
              : "selected_brand",
        });
        continue;
      }
      if (
        projectionCtx &&
        !isBrandFactRelevantForProjection(key, projectionCtx)
      ) {
        continue;
      }
      facts.push({
        key,
        value,
        ...(typeof f.tier === "string" ? { tier: f.tier } : {}),
        ...(typeof f.provenance === "string"
          ? { provenance: f.provenance }
          : {}),
      });
    }
    const negativesRaw = Array.isArray(packet.negatives) ? packet.negatives : [];
    const negatives: CanonicalBrandContext["negatives"] = [];
    for (const n of negativesRaw) {
      if (!isRecord(n)) continue;
      const text = typeof n.text === "string" ? n.text.trim() : "";
      if (!text) continue;
      negatives.push({
        text,
        ...(typeof n.source === "string" ? { source: n.source } : {}),
      });
    }
    // Supplement packet with common flat stamps when packet omitted them.
    const flatSupplements: Array<[string, string | undefined]> = [
      ["brandName", canonicalName],
      [
        "brandColors",
        Array.isArray(metadata.brandColors)
          ? (metadata.brandColors as unknown[])
              .filter(
                (c): c is string => typeof c === "string" && Boolean(c.trim()),
              )
              .join(", ")
          : readString(metadata, "brandColors"),
      ],
      ["brandTone", readString(metadata, "brandTone")],
      [
        "toneAdjectives",
        Array.isArray(metadata.toneAdjectives)
          ? (metadata.toneAdjectives as unknown[])
              .filter(
                (c): c is string => typeof c === "string" && Boolean(c.trim()),
              )
              .join(", ")
          : undefined,
      ],
      ["brandSummary", readString(metadata, "brandSummary")],
      [
        "illustrationStyle",
        readString(metadata, "illustrationStyle") ||
          readString(metadata, "brandIllustrationStyle"),
      ],
      [
        "typography",
        readString(metadata, "typography") ||
          readString(metadata, "brandTypography"),
      ],
      [
        "photographyStyle",
        readString(metadata, "photographyStyle") ||
          readString(metadata, "brandPhotographyStyle"),
      ],
      [
        "positioning",
        readString(metadata, "positioning") ||
          readString(metadata, "brandPositioning"),
      ],
    ];
    const existing = new Set(facts.map((f) => f.key));
    for (const [key, value] of flatSupplements) {
      if (!value || existing.has(key)) continue;
      if (
        projectionCtx &&
        !isBrandFactRelevantForProjection(key, projectionCtx)
      ) {
        continue;
      }
      facts.push({
        key,
        value,
        provenance:
          key === "brandName" ? "selected_brand" : "execution_metadata",
      });
      existing.add(key);
    }
    // Referenced entities from prompt extraction — contextual only, not identity.
    if (identity.extractedBrandEntities.length > 0) {
      const refs = identity.extractedBrandEntities
        .filter(
          (e) =>
            !canonicalName ||
            e.toLowerCase() !== canonicalName.toLowerCase(),
        )
        .join(", ");
      if (refs && !existing.has("referencedBrandEntities")) {
        if (
          !projectionCtx ||
          isBrandFactRelevantForProjection("referencedBrandEntities", projectionCtx)
        ) {
          facts.push({
            key: "referencedBrandEntities",
            value: refs,
            provenance: "prompt_extraction",
          });
        }
      }
    }
    return {
      brandId: authoritativeBrandId,
      brandName: canonicalName,
      ...(typeof packet.provenanceLine === "string" && packet.provenanceLine.trim()
        ? { provenanceLine: packet.provenanceLine.trim() }
        : {}),
      facts,
      negatives,
      factKeys: Object.freeze(facts.map((f) => f.key)),
      factProvenance: Object.freeze(
        facts.map((f) => ({
          key: f.key,
          provenance: f.provenance ?? "unknown",
        })),
      ),
    };
  }

  const brandId = selectedBrandId;
  const brandName = canonicalName;
  if (!brandId && !brandName) return undefined;

  const facts: CanonicalBrandContext["facts"] = [];
  const pushFact = (
    key: string,
    value: string | undefined,
    provenance?: string,
  ) => {
    if (!value) return;
    if (
      projectionCtx &&
      !isBrandFactRelevantForProjection(key, projectionCtx)
    ) {
      return;
    }
    if (facts.some((f) => f.key === key)) return;
    facts.push({
      key,
      value,
      ...(provenance ? { provenance } : {}),
    });
  };

  if (brandName) {
    pushFact("brandName", brandName, "selected_brand");
  }
  const colors = Array.isArray(metadata.brandColors)
    ? (metadata.brandColors as unknown[])
        .filter((c): c is string => typeof c === "string" && Boolean(c.trim()))
        .join(", ")
    : readString(metadata, "brandColors");
  pushFact("brandColors", colors, "execution_metadata");
  pushFact("brandTone", readString(metadata, "brandTone"), "execution_metadata");
  const toneAdj = Array.isArray(metadata.toneAdjectives)
    ? (metadata.toneAdjectives as unknown[])
        .filter((c): c is string => typeof c === "string" && Boolean(c.trim()))
        .join(", ")
    : undefined;
  pushFact("toneAdjectives", toneAdj, "execution_metadata");
  // Flat stamps that may already be present from profile / continuity.
  // Aliases: some binders stamp brandIllustrationStyle etc. while CMR expects
  // the canonical fact keys used by brand-fact-relevance.
  const flatFactSources: Array<[string, string | undefined]> = [
    ["brandSummary", readString(metadata, "brandSummary")],
    ["positioning", readString(metadata, "positioning") || readString(metadata, "brandPositioning")],
    ["voice", readString(metadata, "voice")],
    [
      "typography",
      readString(metadata, "typography") || readString(metadata, "brandTypography"),
    ],
    [
      "photographyStyle",
      readString(metadata, "photographyStyle") ||
        readString(metadata, "brandPhotographyStyle"),
    ],
    [
      "illustrationStyle",
      readString(metadata, "illustrationStyle") ||
        readString(metadata, "brandIllustrationStyle"),
    ],
    ["targetAudience", readString(metadata, "targetAudience")],
    ["industry", readString(metadata, "industry")],
    ["guidelines", readString(metadata, "guidelines")],
    ["voiceGuidelines", readString(metadata, "voiceGuidelines")],
    ["writingStyle", readString(metadata, "writingStyle")],
  ];
  for (const [key, value] of flatFactSources) {
    pushFact(key, value, "execution_metadata");
  }

  if (identity.extractedBrandEntities.length > 0) {
    const refs = identity.extractedBrandEntities
      .filter(
        (e) => !brandName || e.toLowerCase() !== brandName.toLowerCase(),
      )
      .join(", ");
    pushFact("referencedBrandEntities", refs || undefined, "prompt_extraction");
  }

  if (facts.length === 0) return undefined;

  return {
    brandId: brandId || brandName || "unknown",
    brandName,
    facts,
    negatives: [],
    factKeys: Object.freeze(facts.map((f) => f.key)),
    factProvenance: Object.freeze(
      facts.map((f) => ({
        key: f.key,
        provenance: f.provenance ?? "unknown",
      })),
    ),
  };
}

export function resolveCanonicalProductGroundingFromMetadata(
  metadata: Readonly<Record<string, unknown>>,
): CanonicalProductGrounding | undefined {
  const grounding: CanonicalProductGrounding = {
    ...(readString(metadata, "service")
      ? { service: readString(metadata, "service") }
      : {}),
    ...(readString(metadata, "subtype")
      ? { subtype: readString(metadata, "subtype") }
      : {}),
    ...(readString(metadata, "platform")
      ? { platform: readString(metadata, "platform") }
      : {}),
    ...(readString(metadata, "format")
      ? { format: readString(metadata, "format") }
      : {}),
    ...(readString(metadata, "category")
      ? { category: readString(metadata, "category") }
      : {}),
  };
  if (
    !grounding.service &&
    !grounding.subtype &&
    !grounding.platform &&
    !grounding.format
  ) {
    return undefined;
  }
  return grounding;
}
