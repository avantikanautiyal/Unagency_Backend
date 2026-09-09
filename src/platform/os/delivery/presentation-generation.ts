/**
 * Presentation route generation — brief-lock instructions and relevance validation.
 * Phase A: lightweight concepts. Phase B: expand to full slides.
 */

import { QualityEvaluator } from "../evaluation/evaluators/quality-evaluator";
import type { EvaluationOutcome } from "../evaluation/contracts/evaluation-result";

const STOPWORDS = new Set([
  "about",
  "after",
  "also",
  "and",
  "are",
  "brand",
  "create",
  "deck",
  "for",
  "from",
  "have",
  "into",
  "make",
  "modern",
  "must",
  "need",
  "presentation",
  "presentations",
  "slide",
  "slides",
  "that",
  "the",
  "their",
  "this",
  "through",
  "using",
  "with",
  "your",
]);

/** Generic stock-deck topics when absent from the user brief. */
const OFF_TOPIC_PHRASES = [
  "culinary innovation",
  "food service",
  "restaurant",
  "sustainable innovation",
  "green visions",
  "flavor fusion",
  "digital transformation",
  "cutting-edge technology to reshape industries",
] as const;

const SUBTYPE_DECK_GUIDANCE: Record<string, string> = {
  corporate:
    "Corporate company profile and brand/strategy deck for the client named in the brief — not a generic industry overview.",
  "pitch-decks":
    "Investor, sales, or partnership pitch deck for the client in the brief.",
  product:
    "Product launch or sales presentation for the client in the brief.",
  training:
    "Training or learning presentation for the client in the brief.",
  templates:
    "Editable presentation template system for the client brand in the brief.",
  infographics:
    "Data-led infographic presentation for the client in the brief.",
  gifs: "Short animated visual presentation for the client in the brief.",
};

export type PresentationRelevanceResult = {
  readonly ok: boolean;
  readonly reasons: readonly string[];
  readonly anchorHits: number;
  readonly anchorTotal: number;
};

/** Max chars for brief anchors in presentation instruction blocks. */
export const PRESENTATION_BRIEF_ANCHOR_MAX_CHARS = 2000;

const MEGAPROMPT_BLOCK_BOUNDARY =
  /(?=\[(?:Product selection|Selected brand|Structured |Refine OS|User brief|User prompt)|Respond with ONLY valid JSON|$)/i;

function extractMegapromptBlock(prompt: string, blockName: string): string {
  const re = new RegExp(
    `\\[${blockName}[^\\]]*\\]\\s*([\\s\\S]*?)${MEGAPROMPT_BLOCK_BOUNDARY.source}`,
    "i",
  );
  const match = prompt.match(re);
  return match?.[1]?.replace(/\s+/g, " ").trim() ?? "";
}

function mergeStructuredMegapromptContext(
  prompt: string,
  userBrief: string,
): string {
  const parts: string[] = [];
  const trimmed = userBrief.trim();
  if (trimmed) parts.push(trimmed);

  for (const blockName of [
    "Structured Brief",
    "Structured Brand Context",
    "Structured Knowledge Context",
  ] as const) {
    const content = extractMegapromptBlock(prompt, blockName);
    if (!content) continue;
    const hay = trimmed.toLowerCase();
    if (hay && hay.includes(content.toLowerCase())) continue;
    parts.push(content);
  }

  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function previewUserBrief(
  brief: string,
  maxChars = PRESENTATION_BRIEF_ANCHOR_MAX_CHARS,
): string {
  if (brief.length <= maxChars) return brief;
  return `${brief.slice(0, maxChars - 1)}…`;
}

export function extractUserBriefFromMegaprompt(prompt: string): string {
  const raw = prompt.trim();
  if (!raw) return "";

  let text = raw;
  const markers = ["[User brief]", "[User prompt]", "Original client brief:"] as const;
  for (const marker of markers) {
    const idx = text.indexOf(marker);
    if (idx >= 0) {
      text = text.slice(idx + marker.length).trim();
      break;
    }
  }
  text = text
    .replace(/\[Product selection[\s\S]*?(?=\[|$)/gi, " ")
    .replace(/\[Selected brand[\s\S]*?(?=\[|$)/gi, " ")
    .replace(/\[Structured Brief[\s\S]*?(?=\[|$)/gi, " ")
    .replace(/\[Structured Brand Context[\s\S]*?(?=\[|$)/gi, " ")
    .replace(/\[Structured Knowledge Context[\s\S]*?(?=\[|$)/gi, " ")
    .replace(/\[Refine OS constraints\][\s\S]*?(?=\[|$)/gi, " ")
    .replace(/Respond with ONLY valid JSON[\s\S]*$/i, " ")
    .replace(/\s+/g, " ")
    .trim();

  return mergeStructuredMegapromptContext(raw, text);
}

export function extractBrandNameFromMegaprompt(prompt: string): string | undefined {
  const patterns = [
    /Brand name:\s*([^\n]+)/i,
    /\[Brand name=([^\]]+)\]/i,
    /Brand:\s*([^\n]+)/i,
  ];
  for (const pattern of patterns) {
    const match = prompt.match(pattern);
    const name = match?.[1]?.trim();
    if (name && name.length >= 2 && !/^n\/a$/i.test(name)) {
      return name.replace(/^["']|["']$/g, "");
    }
  }
  return undefined;
}

export function extractAnchorTokens(brief: string, brandName?: string): string[] {
  const tokens = new Set<string>();
  const hay = brief.toLowerCase();
  if (brandName && brandName.length >= 2) {
    tokens.add(brandName.toLowerCase());
  }
  for (const word of hay.split(/\W+/)) {
    const w = word.trim();
    if (w.length < 4 || STOPWORDS.has(w)) continue;
    tokens.add(w);
  }
  return [...tokens].slice(0, 24);
}

function routesTextBlob(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const routes = (data as Record<string, unknown>).routes;
  if (!Array.isArray(routes)) return JSON.stringify(data);
  return JSON.stringify(routes).toLowerCase();
}

export function validatePresentationConceptsRelevance(input: {
  readonly data: unknown;
  readonly userBrief: string;
  readonly brandName?: string;
}): PresentationRelevanceResult {
  const rec =
    input.data && typeof input.data === "object"
      ? (input.data as Record<string, unknown>)
      : null;
  const concepts = rec?.concepts;
  if (!Array.isArray(concepts) || concepts.length < 3) {
    return { ok: false, reasons: ["empty_concepts"], anchorHits: 0, anchorTotal: 0 };
  }
  return validatePresentationRoutesRelevance({
    data: {
      routes: concepts.map((item) => {
        const c =
          item && typeof item === "object"
            ? (item as Record<string, unknown>)
            : {};
        const title = typeof c.title === "string" ? c.title : "";
        const description = typeof c.description === "string" ? c.description : "";
        const narrativeAngle =
          typeof c.narrativeAngle === "string" ? c.narrativeAngle : "";
        return {
          title,
          description,
          deckTitle: title,
          deckSubtitle: narrativeAngle || description,
          slides: [],
        };
      }),
    },
    userBrief: input.userBrief,
    brandName: input.brandName,
  });
}

export function buildPresentationSystemRoleBlock(input: {
  readonly brandName?: string;
  readonly subtype?: string;
  readonly exampleDeliverable?: string;
}): string {
  const brand = input.brandName?.trim();
  const deliverable =
    input.exampleDeliverable?.trim() ||
    deckGuidanceForSubtype(input.subtype);
  const lines = [
    "[Role — corporate presentation director]",
    brand
      ? `You are the lead presentation director for ${brand}. Every output must serve this brand and the client brief — never generic stock decks.`
      : "You are a senior presentation director. Every output must serve the specific client brief — never generic stock decks.",
    deliverable,
    "Non-negotiable: creative angles on the SAME brief and brand; no unrelated industries unless the brief asks for them.",
  ];
  return lines.join("\n");
}

export function buildPresentationNonNegotiablesBlock(input: {
  readonly userBrief?: string;
  readonly brandName?: string;
  readonly mustUseFacts?: readonly PresentationMustUseFact[];
}): string {
  const lines = ["[Non-negotiables — read last, obey first]"];
  const mustUse = buildPresentationMustUseBlock(input.mustUseFacts);
  if (mustUse) lines.push(mustUse);
  if (input.brandName?.trim()) {
    lines.push(
      `Brand: ${input.brandName.trim()} — must appear in every route title or deck title.`,
    );
  }
  if (input.userBrief?.trim()) {
    lines.push(
      `Client brief (all routes must reflect this): ${previewUserBrief(input.userBrief)}`,
    );
  }
  lines.push(
    "Forbidden unless in brief: culinary, sustainability tropes, generic digital transformation filler.",
    "Never use placeholder or mock content (no lorem ipsum, sample companies, generic SaaS filler). Every bullet must cite real facts from the brief and brand profile above.",
  );
  const paletteFacts =
    input.mustUseFacts?.filter((f) => f.key === "palette") ?? [];
  if (paletteFacts.length) {
    lines.push(
      `Brand colours (reference in visualCue on every slide): ${paletteFacts.map((f) => f.value).join(", ")}`,
    );
  }
  return lines.join("\n");
}

export type PresentationMustUseFact = {
  readonly key: string;
  readonly value: string;
  readonly source: "brief" | "brand" | "knowledge";
};

export type PresentationMeta = {
  readonly grounding: readonly string[];
  readonly regenerated?: boolean;
  readonly verifyPassed: boolean;
  readonly reinforced?: boolean;
  readonly mustUseMissing?: readonly string[];
  readonly lazyExpand?: boolean;
  readonly phase?: 'concepts' | 'routes';
  readonly fastPath?: boolean;
};

export type PresentationExpandMode = 'lazy' | 'full' | 'single';

function pushUniqueFact(
  facts: PresentationMustUseFact[],
  seen: Set<string>,
  fact: PresentationMustUseFact
): void {
  const key = `${fact.source}:${fact.key}:${fact.value}`.toLowerCase();
  if (seen.has(key) || !fact.value.trim()) return;
  seen.add(key);
  facts.push(fact);
}

function colorTokensFromMetadata(
  metadata: Readonly<Record<string, unknown>> | undefined
): string[] {
  const out: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === "string" && v.trim()) out.push(v.trim());
    if (Array.isArray(v)) {
      for (const item of v) {
        if (typeof item === "string" && item.trim()) out.push(item.trim());
      }
    }
  };
  push(metadata?.learnedBrandColors);
  push(metadata?.brandColors);
  push(metadata?.briefExtractedColors);
  if (metadata?.visualBrandFields && typeof metadata.visualBrandFields === "object") {
    push((metadata.visualBrandFields as Record<string, unknown>).colors);
  }
  const brandCtx = metadata?.structuredBrandContext;
  if (brandCtx && typeof brandCtx === "object") {
    const colors = (brandCtx as Record<string, unknown>).colors;
    if (colors && typeof colors === "object") {
      const palette = (colors as Record<string, unknown>).palette;
      push(palette);
    }
  }
  const packet = metadata?.brandContextPacket;
  if (packet && typeof packet === "object") {
    const packetFacts = (packet as Record<string, unknown>).facts;
    if (Array.isArray(packetFacts)) {
      for (const item of packetFacts) {
        if (!item || typeof item !== "object") continue;
        const f = item as Record<string, unknown>;
        const key = typeof f.key === "string" ? f.key.toLowerCase() : "";
        const value = typeof f.value === "string" ? f.value.trim() : "";
        if ((key.includes("color") || key.includes("palette")) && value) {
          push(value);
        }
      }
    }
  }
  return [...new Set(out)].slice(0, 6);
}

function profileFactsFromMetadata(
  metadata: Readonly<Record<string, unknown>> | undefined
): Array<{ key: string; value: string }> {
  if (!metadata) return [];
  const out: Array<{ key: string; value: string }> = [];
  const push = (key: string, raw: unknown) => {
    if (typeof raw === "string" && raw.trim().length >= 3) {
      out.push({ key, value: raw.trim() });
    }
  };
  push("industry", metadata.brandIndustry);
  push("positioning", metadata.brandPositioning);
  push("audience", metadata.brandTargetAudience);
  push("summary", metadata.brandSummary);
  push("photography", metadata.brandPhotographyStyle);
  push("illustration", metadata.brandIllustrationStyle);
  push("typography", metadata.brandTypography);
  const avoid = metadata.brandWordsToAvoid;
  if (Array.isArray(avoid) && avoid.length) {
    const joined = avoid
      .filter((w): w is string => typeof w === "string" && w.trim().length > 0)
      .slice(0, 6)
      .join(", ");
    if (joined.length >= 3) out.push({ key: "avoid", value: joined });
  }
  return out;
}

function packetFactsFromMetadata(
  metadata: Readonly<Record<string, unknown>> | undefined
): Array<{ key: string; value: string }> {
  const packet = metadata?.brandContextPacket;
  if (!packet || typeof packet !== "object") return [];
  const facts = (packet as Record<string, unknown>).facts;
  if (!Array.isArray(facts)) return [];
  const out: Array<{ key: string; value: string }> = [];
  for (const item of facts.slice(0, 8)) {
    if (!item || typeof item !== "object") continue;
    const f = item as Record<string, unknown>;
    const key = typeof f.key === "string" ? f.key.trim() : "";
    const value = typeof f.value === "string" ? f.value.trim() : "";
    if (key && value.length >= 3) out.push({ key, value });
  }
  return out;
}

/** Pull generation constraints from brief, brand, and knowledge — not just RAG context. */
export function extractPresentationMustUseFacts(input: {
  readonly userBrief: string;
  readonly brandName?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}): PresentationMustUseFact[] {
  const facts: PresentationMustUseFact[] = [];
  const seen = new Set<string>();
  const brand = input.brandName?.trim();

  if (brand) {
    pushUniqueFact(facts, seen, { key: "brand", value: brand, source: "brand" });
  }

  for (const color of colorTokensFromMetadata(input.metadata)) {
    pushUniqueFact(facts, seen, {
      key: "palette",
      value: color,
      source: "brand",
    });
  }

  const toneParts: string[] = [];
  if (typeof input.metadata?.brandTone === "string") {
    toneParts.push(input.metadata.brandTone.trim());
  }
  if (Array.isArray(input.metadata?.learnedBrandTone)) {
    toneParts.push(
      ...input.metadata.learnedBrandTone.filter(
        (t): t is string => typeof t === "string" && t.trim().length > 0
      )
    );
  }
  if (toneParts.length) {
    pushUniqueFact(facts, seen, {
      key: "tone",
      value: toneParts.slice(0, 4).join(", "),
      source: "brand",
    });
  }

  for (const { key, value } of profileFactsFromMetadata(input.metadata)) {
    pushUniqueFact(facts, seen, { key, value, source: "brand" });
  }

  for (const { key, value } of packetFactsFromMetadata(input.metadata)) {
    pushUniqueFact(facts, seen, { key, value, source: "knowledge" });
  }

  const knowledgeCtx = input.metadata?.structuredKnowledgeContext;
  if (knowledgeCtx && typeof knowledgeCtx === "object") {
    const kFacts = (knowledgeCtx as Record<string, unknown>).facts;
    if (Array.isArray(kFacts)) {
      for (const item of kFacts.slice(0, 6)) {
        if (!item || typeof item !== "object") continue;
        const f = item as Record<string, unknown>;
        const key = typeof f.key === "string" ? f.key.trim() : "";
        const value = typeof f.value === "string" ? f.value.trim() : "";
        if (key && value && value.length >= 3) {
          pushUniqueFact(facts, seen, { key, value, source: "knowledge" });
        }
      }
    }
  }

  const cached = input.metadata?.presentationMustUseFacts;
  if (Array.isArray(cached)) {
    for (const item of cached) {
      if (!item || typeof item !== "object") continue;
      const f = item as Record<string, unknown>;
      const key = typeof f.key === "string" ? f.key : "";
      const value = typeof f.value === "string" ? f.value : "";
      const source =
        f.source === "brand" || f.source === "knowledge" || f.source === "brief"
          ? f.source
          : "brief";
      if (key && value) pushUniqueFact(facts, seen, { key, value, source });
    }
  }

  const anchors = extractAnchorTokens(input.userBrief, brand).slice(0, 6);
  for (const token of anchors) {
    if (token.length < 4) continue;
    pushUniqueFact(facts, seen, {
      key: "brief",
      value: token,
      source: "brief",
    });
  }

  return facts.slice(0, 14);
}

export function buildPresentationMustUseBlock(
  facts: readonly PresentationMustUseFact[] | undefined
): string {
  if (!facts?.length) return "";
  return [
    "[MUST USE — generation constraints]",
    "These facts MUST appear in route titles, deck titles, bullets, or visual cues:",
    ...facts.map((f) => `- ${f.key}: ${f.value}`),
  ].join("\n");
}

export function validatePresentationMustUseCoverage(input: {
  readonly data: unknown;
  readonly facts: readonly PresentationMustUseFact[];
}): { readonly ok: boolean; readonly missing: readonly string[] } {
  if (!input.facts.length) return { ok: true, missing: [] };
  const blob = routesTextBlob(input.data).toLowerCase();
  const missing: string[] = [];

  for (const fact of input.facts) {
    const val = fact.value.trim().toLowerCase();
    if (val.length < 3) continue;
    if (blob.includes(val)) continue;
    const words = val.split(/\W+/).filter((w) => w.length >= 4);
    if (words.length >= 2) {
      const hits = words.filter((w) => blob.includes(w)).length;
      if (hits >= Math.ceil(words.length * 0.5)) continue;
    }
    missing.push(fact.key);
  }

  const paletteFacts = input.facts.filter((f) => f.key === "palette");
  if (paletteFacts.length) {
    const paletteHit = paletteFacts.some((f) => {
      const raw = f.value.trim().toLowerCase();
      const hex = raw.replace(/^#/, "");
      return blob.includes(raw) || (hex.length >= 3 && blob.includes(hex));
    });
    if (!paletteHit && !missing.includes("palette")) {
      missing.push("palette");
    }
  }

  const criticalKeys = ["brand", "industry", "positioning", "audience", "summary"];
  for (const key of criticalKeys) {
    if (input.facts.some((f) => f.key === key) && missing.includes(key)) {
      return { ok: false, missing };
    }
  }

  if (input.facts.some((f) => f.key === "brand") && missing.includes("brand")) {
    return { ok: false, missing };
  }
  if (input.facts.length <= 3) {
    return { ok: missing.length === 0, missing };
  }
  return {
    ok: missing.length <= Math.floor(input.facts.length * 0.45),
    missing,
  };
}

export function buildPresentationGroundingLabels(input: {
  readonly brandName?: string;
  readonly facts: readonly PresentationMustUseFact[];
}): string[] {
  const labels: string[] = [];
  if (input.brandName?.trim()) labels.push(input.brandName.trim());
  for (const fact of input.facts) {
    if (fact.key === "brand") continue;
    const value = fact.value.trim();
    if (value.length >= 3 && value.length <= 48) labels.push(value);
  }
  return [...new Set(labels)].slice(0, 6);
}

export function parsePresentationMeta(data: unknown): PresentationMeta | null {
  if (!data || typeof data !== "object") return null;
  const rec = data as Record<string, unknown>;
  const raw = rec.presentationMeta;
  if (!raw || typeof raw !== "object") return null;
  const meta = raw as Record<string, unknown>;
  const grounding = Array.isArray(meta.grounding)
    ? meta.grounding.filter((g): g is string => typeof g === "string")
    : [];
  return {
    grounding,
    regenerated: meta.regenerated === true,
    verifyPassed: meta.verifyPassed !== false,
    reinforced: meta.reinforced === true,
    mustUseMissing: Array.isArray(meta.mustUseMissing)
      ? meta.mustUseMissing.filter((m): m is string => typeof m === "string")
      : undefined,
  };
}

export function orderPresentationProviderPrompt(input: {
  readonly body: string;
  readonly brandName?: string;
  readonly subtype?: string;
  readonly exampleDeliverable?: string;
  readonly userBrief?: string;
  readonly mustUseFacts?: readonly PresentationMustUseFact[];
}): string {
  const system = buildPresentationSystemRoleBlock({
    brandName: input.brandName,
    subtype: input.subtype,
    exampleDeliverable: input.exampleDeliverable,
  });
  const tail = buildPresentationNonNegotiablesBlock({
    userBrief: input.userBrief,
    brandName: input.brandName,
    mustUseFacts: input.mustUseFacts,
  });
  const body = input.body.trim();
  return [system, body, tail].filter(Boolean).join("\n\n");
}

export function buildPresentationConceptsInstructionBlock(input: {
  readonly userBrief?: string;
  readonly brandName?: string;
  readonly subtype?: string;
  readonly exampleDeliverable?: string;
  readonly isRetry?: boolean;
}): string {
  const lines = [
    "[Presentation Phase A — route concepts only]",
    "Return exactly 3 concepts as creative angles on the SAME client brief and brand.",
    "Each concept: title (picker label), description (why this fits the brief), narrativeAngle (visual mood + story arc).",
    "Do NOT write slides yet — concepts only.",
    deckGuidanceForSubtype(input.subtype),
  ];
  if (input.exampleDeliverable?.trim()) {
    lines.push(`Deliverable: ${input.exampleDeliverable.trim()}`);
  }
  if (input.brandName?.trim()) {
    lines.push(
      `Brand lock: every concept MUST reference "${input.brandName.trim()}".`,
    );
  }
  if (input.userBrief?.trim()) {
    lines.push(`Brief anchor: ${previewUserBrief(input.userBrief)}`);
  }
  if (input.isRetry) {
    lines.push(
      "RETRY: Prior concepts were off-brief. Regenerate all 3 strictly grounded in the brief.",
    );
  }
  return lines.join("\n");
}

export function lockedConceptsDirectionsText(concepts: unknown): string {
  if (!concepts || typeof concepts !== "object") return "";
  const list = (concepts as Record<string, unknown>).concepts;
  if (!Array.isArray(list)) return "";
  return list
    .slice(0, 3)
    .map((item, index) => {
      if (!item || typeof item !== "object") return "";
      const c = item as Record<string, unknown>;
      const title = typeof c.title === "string" ? c.title.trim() : `Route ${index + 1}`;
      const description =
        typeof c.description === "string" ? c.description.trim() : "";
      const narrativeAngle =
        typeof c.narrativeAngle === "string" ? c.narrativeAngle.trim() : "";
      return [
        `Concept ${index + 1}: ${title}`,
        description ? `  Direction: ${description}` : "",
        narrativeAngle ? `  Narrative / mood: ${narrativeAngle}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .filter(Boolean)
    .join("\n\n");
}

export function buildPresentationExpansionInstructionBlock(input: {
  readonly lockedConcepts: unknown;
  readonly brandName?: string;
  readonly subtype?: string;
  readonly userBrief?: string;
  readonly mustUseFacts?: readonly PresentationMustUseFact[];
}): string {
  const locked = lockedConceptsDirectionsText(input.lockedConcepts);
  const lines = [
    "[Presentation Phase B — expand locked concepts to full decks]",
    "Expand each validated concept below into a complete deck (deckTitle, deckSubtitle, 6–14 slides).",
    "Do NOT change concept titles or narrative angles — only expand into designed slides.",
    "Use ONLY facts from the client brief and brand profile — never generic mock or placeholder content.",
    deckGuidanceForSubtype(input.subtype),
    locked ? `\n${locked}` : "",
    "Use varied slide layouts. Every slide needs visualCue as a concrete image brief (subject, setting, lighting, style, palette) tied to the brand colours and client brief — written so an image model can render it.",
  ];
  const mustUse = buildPresentationMustUseBlock(input.mustUseFacts);
  if (mustUse) lines.push(mustUse);
  if (input.userBrief?.trim()) {
    lines.push(
      `Brief anchor (every slide must reflect this): ${previewUserBrief(input.userBrief)}`,
    );
  }
  if (input.brandName?.trim()) {
    lines.push(
      `Brand lock: "${input.brandName.trim()}" must appear in every deckTitle or title slide.`,
    );
  }
  return lines.join("\n");
}

export function evaluatePresentationOutputQuality(input: {
  readonly structured: unknown;
  readonly userBrief: string;
  readonly organizationId?: string;
}): { readonly outcome: EvaluationOutcome; readonly preview: string } {
  const preview = routesTextBlob(input.structured);
  const evaluator = new QualityEvaluator();
  const result = evaluator.evaluate({
    organizationId: input.organizationId?.trim() || "presentation",
    executionId: "presentation",
    planId: "presentation",
    planVersion: 1,
    preview: preview || " ",
    objective: input.userBrief,
    briefObjective: input.userBrief,
  });
  return { outcome: result.outcome, preview };
}

export function validatePresentationRoutesRelevance(input: {
  readonly data: unknown;
  readonly userBrief: string;
  readonly brandName?: string;
}): PresentationRelevanceResult {
  const reasons: string[] = [];
  const brief = input.userBrief.trim();
  const blob = routesTextBlob(input.data);
  if (!blob || blob.length < 40) {
    return { ok: false, reasons: ["empty_routes"], anchorHits: 0, anchorTotal: 0 };
  }

  const briefLower = brief.toLowerCase();
  const brand = input.brandName?.trim();

  if (brand && brand.length >= 2 && !blob.includes(brand.toLowerCase())) {
    reasons.push("missing_brand_name");
  }

  const anchors = extractAnchorTokens(brief, brand);
  const anchorHits = anchors.filter((a) => blob.includes(a)).length;
  const anchorTotal = anchors.length;
  // Soften: require zero overlap only when the brief has enough anchors.
  if (anchorTotal >= 4 && anchorHits === 0) {
    reasons.push("low_brief_overlap");
  }

  let offTopicCount = 0;
  for (const phrase of OFF_TOPIC_PHRASES) {
    if (blob.includes(phrase) && !briefLower.includes(phrase)) {
      offTopicCount += 1;
    }
  }
  // Single stock phrase is a soft smell; multiple is a hard off-brief signal.
  if (offTopicCount >= 2) {
    reasons.push(`off_topic:multiple`);
  }

  return {
    ok: reasons.length === 0,
    reasons,
    anchorHits,
    anchorTotal,
  };
}

export function deckGuidanceForSubtype(subtype?: string): string {
  const key = (subtype ?? "").trim().toLowerCase();
  return (
    SUBTYPE_DECK_GUIDANCE[key] ??
    "Presentation deck for the specific client and brief below — never generic stock topics."
  );
}

export function buildPresentationRoutesInstructionBlock(input: {
  readonly userBrief?: string;
  readonly brandName?: string;
  readonly subtype?: string;
  readonly exampleDeliverable?: string;
  readonly isRetry?: boolean;
}): string {
  const lines = [
    "[Presentation generation — non-negotiable]",
    "All 3 routes MUST be creative angles on the SAME client brief and SAME brand below.",
    "Each route is a full deck (deckTitle, deckSubtitle, slides) with a different narrative angle, visual mood, and slide flow.",
    "Do NOT invent unrelated industries or generic stock topics (e.g. culinary, sustainability, random digital transformation) unless the brief explicitly asks for them.",
    deckGuidanceForSubtype(input.subtype),
  ];

  if (input.exampleDeliverable?.trim()) {
    lines.push(`Deliverable: ${input.exampleDeliverable.trim()}`);
  }
  if (input.brandName?.trim()) {
    lines.push(
      `Brand lock: every route MUST name "${input.brandName.trim()}" in deckTitle or the title slide and stay on-brand.`,
    );
  }
  if (input.userBrief?.trim()) {
    lines.push(
      `Brief anchor (all routes must reflect this): ${previewUserBrief(input.userBrief)}`,
    );
  }

  lines.push(
    "Use varied slide layouts (title_hero, section_divider, content_bullets, key_message, closing).",
    "Write punchy slide titles and short bullets — never dump paragraphs onto slides.",
    "Every slide needs a visualCue that is a concrete image brief (subject, setting, composition, style, colours) matching this brand and brief — not a layout label.",
  );

  if (input.isRetry) {
    lines.push(
      "RETRY: Your prior output was off-brief or missing the brand. Regenerate all 3 routes strictly grounded in the brief above.",
    );
  }

  return lines.join("\n");
}

export function buildPresentationRelevanceRetrySuffix(input: {
  readonly reasons: readonly string[];
  readonly brandName?: string;
}): string {
  const lines = [
    "",
    "[Presentation relevance retry — required fix]",
    "The previous JSON was rejected because it was not grounded in the client brief.",
    `Issues: ${input.reasons.join(", ")}`,
  ];
  if (input.brandName?.trim()) {
    lines.push(
      `You MUST include the brand name "${input.brandName.trim()}" in every route's deckTitle or first slide title.`,
    );
  }
  lines.push(
    "Regenerate all 3 routes as different creative angles on the SAME brief — not unrelated industry topics.",
  );
  return lines.join("\n");
}

export function presentationContextFromMetadata(
  metadata: Readonly<Record<string, unknown>> | undefined,
  prompt: string
): {
  userBrief: string;
  brandName?: string;
  subtype?: string;
  exampleDeliverable?: string;
  mustUseFacts: PresentationMustUseFact[];
} {
  const userBrief = extractUserBriefFromMegaprompt(prompt);
  const brandName =
    (typeof metadata?.brandName === "string" ? metadata.brandName : undefined) ??
    extractBrandNameFromMegaprompt(prompt);
  const mustUseFacts = extractPresentationMustUseFacts({
    userBrief,
    brandName,
    metadata,
  });
  return {
    userBrief,
    brandName,
    subtype:
      typeof metadata?.subtype === "string" ? metadata.subtype : undefined,
    exampleDeliverable:
      typeof metadata?.exampleDeliverable === "string"
        ? metadata.exampleDeliverable
        : undefined,
    mustUseFacts,
  };
}

export function resolvePresentationExpandMode(
  metadata: Readonly<Record<string, unknown>> | undefined
): PresentationExpandMode {
  const productAction =
    typeof metadata?.productAction === "string"
      ? metadata.productAction.trim().toLowerCase()
      : "";
  // Client on-demand expand of one locked concept → single-deck path.
  if (productAction === "expand_presentation_route") {
    return "single";
  }

  const subtype =
    typeof metadata?.subtype === "string"
      ? metadata.subtype.trim().toLowerCase()
      : "";
  // GIFs remain concepts-only / lazy on create.
  if (subtype === "gifs") {
    return "lazy";
  }

  const mode = metadata?.presentationExpandMode;
  if (mode === "single") return "single";
  // Pitch decks and other presentation subtypes must expand to full slide decks
  // on create so PDF/PPTX can materialize. Ignore stale client "lazy" stamps.
  if (mode === "full" || mode === "lazy" || mode == null) {
    return "full";
  }
  if (metadata?.presentationLazyExpand === false) return "full";
  return "full";
}

export function conceptRecordAt(
  data: unknown,
  index: number
): Record<string, unknown> | null {
  if (!data || typeof data !== "object") return null;
  const concepts = (data as Record<string, unknown>).concepts;
  if (!Array.isArray(concepts)) return null;
  const item = concepts[index];
  return item && typeof item === "object"
    ? (item as Record<string, unknown>)
    : null;
}

export function routeHasSlides(data: unknown, index: number): boolean {
  if (!data || typeof data !== "object") return false;
  const routes = (data as Record<string, unknown>).routes;
  if (!Array.isArray(routes)) return false;
  const route = routes[index];
  if (!route || typeof route !== "object") return false;
  const slides = (route as Record<string, unknown>).slides;
  return Array.isArray(slides) && slides.length > 0;
}

export function presentationDirectionNeedsExpansion(
  data: unknown,
  index: number
): boolean {
  if (routeHasSlides(data, index)) return false;
  return conceptRecordAt(data, index) != null;
}

export function isPresentationLazyPayload(data: unknown): boolean {
  const meta = parsePresentationMeta(data);
  if (meta?.lazyExpand === true) return true;
  if (!data || typeof data !== "object") return false;
  const rec = data as Record<string, unknown>;
  return Array.isArray(rec.concepts) && !Array.isArray(rec.routes);
}

export function mergeExpandedRouteAtIndex(input: {
  readonly data: Record<string, unknown>;
  readonly index: number;
  readonly route: Record<string, unknown>;
}): Record<string, unknown> {
  const routes = Array.isArray(input.data.routes)
    ? [...(input.data.routes as unknown[])]
    : [];
  while (routes.length < 3) routes.push(null);
  routes[input.index] = input.route;
  const expanded = new Set<number>(
    Array.isArray(input.data.expandedRouteIndexes)
      ? (input.data.expandedRouteIndexes as number[])
      : []
  );
  expanded.add(input.index);
  const priorMeta =
    typeof input.data.presentationMeta === "object" &&
    input.data.presentationMeta
      ? (input.data.presentationMeta as Record<string, unknown>)
      : {};
  return {
    ...input.data,
    routes,
    expandedRouteIndexes: [...expanded],
    presentationMeta: {
      ...priorMeta,
      lazyExpand: true,
      phase: "routes",
    },
  };
}

export function presentationPlanToRouteRecord(input: {
  readonly concept: Record<string, unknown>;
  readonly plan: Record<string, unknown>;
}): Record<string, unknown> {
  const title =
    (typeof input.concept.title === "string" && input.concept.title.trim()) ||
    (typeof input.plan.title === "string" && input.plan.title.trim()) ||
    "Route";
  const description =
    (typeof input.concept.description === "string" &&
      input.concept.description.trim()) ||
    "";
  const deckSubtitle =
    (typeof input.plan.subtitle === "string" && input.plan.subtitle.trim()) ||
    (typeof input.concept.narrativeAngle === "string"
      ? input.concept.narrativeAngle.trim()
      : "");
  return {
    title,
    description,
    deckTitle:
      (typeof input.plan.title === "string" && input.plan.title.trim()) ||
      title,
    deckSubtitle,
    slides: Array.isArray(input.plan.slides) ? input.plan.slides : [],
  };
}

export function buildSingleRouteExpansionInstructionBlock(input: {
  readonly lockedConcept: Record<string, unknown>;
  readonly brandName?: string;
  readonly subtype?: string;
}): string {
  const title =
    typeof input.lockedConcept.title === "string"
      ? input.lockedConcept.title.trim()
      : "Route";
  const description =
    typeof input.lockedConcept.description === "string"
      ? input.lockedConcept.description.trim()
      : "";
  const narrativeAngle =
    typeof input.lockedConcept.narrativeAngle === "string"
      ? input.lockedConcept.narrativeAngle.trim()
      : "";
  return [
    "[Presentation — expand ONE locked concept to a full deck]",
    `Concept title: ${title}`,
    description ? `Direction: ${description}` : "",
    narrativeAngle ? `Narrative / mood: ${narrativeAngle}` : "",
    "Do NOT change the concept title or narrative — expand into 6–14 designed slides only.",
    deckGuidanceForSubtype(input.subtype),
    input.brandName?.trim()
      ? `Brand lock: "${input.brandName.trim()}" in deckTitle or title slide.`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function conceptsOnlyPresentationMeta(input: {
  readonly brandName?: string;
  readonly mustUseFacts: readonly PresentationMustUseFact[];
  readonly fastPath?: boolean;
}): PresentationMeta {
  return {
    grounding: buildPresentationGroundingLabels({
      brandName: input.brandName,
      facts: input.mustUseFacts,
    }),
    verifyPassed: true,
    lazyExpand: true,
    phase: "concepts",
    ...(input.fastPath ? { fastPath: true } : {}),
  };
}
