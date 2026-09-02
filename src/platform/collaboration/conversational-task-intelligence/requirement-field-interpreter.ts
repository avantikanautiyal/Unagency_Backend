/**
 * Priority 4.6 — Requirement field interpreter.
 * Extracts structured requirement fields from user messages by semantic role.
 * Provider-independent boundary for future LLM-based interpretation.
 */

import type { SemanticSignals } from "./semantic-signals";
import type {
  ContentItemSpec,
  DeliverableFormat,
  NegativeConstraintSpec,
  OutputIntentMode,
} from "./execution-specification";
import type { ConversationalRequirement } from "./conversational-task-contract";
import {
  classifyStyleRequirement,
  extractBrandAssetRequirementFromMessage,
  extractNegativeConstraintsFromMessage,
  negativeConstraintSpec,
} from "./requirement-enforcement";

/** Raw extracted fields before precedence merging. */
export type ExtractedRequirementFields = {
  readonly objective?: string;
  readonly quantity?: number;
  readonly exactness?: "exact" | "approximate";
  readonly wordCount?: number;
  readonly sentenceCount?: number;
  readonly structure?: readonly string[];
  readonly ctaRequired?: boolean;
  readonly contentItems?: readonly ContentItemSpec[];
  readonly tone?: string;
  readonly style?: string;
  readonly visualDirection?: string;
  readonly positiveConstraints?: readonly string[];
  readonly negativeConstraints?: readonly NegativeConstraintSpec[];
  readonly brandAssetRequired?: boolean;
  readonly width?: number;
  readonly height?: number;
  readonly aspectRatio?: string;
  readonly pageCount?: number;
  readonly orientation?: string;
  readonly platform?: string;
  readonly deliverables?: readonly DeliverableFormat[];
  readonly outputMode?: OutputIntentMode;
  readonly alternativesRequested?: boolean;
  readonly rationaleRequired?: boolean;
  readonly rationaleSentenceCount?: number;
  readonly explicit: boolean;
};

export type RequirementFieldInterpreter = {
  readonly interpret: (input: {
    readonly message: string;
    readonly signals: SemanticSignals;
    readonly requirements: readonly ConversationalRequirement[];
    readonly objective?: string;
  }) => ExtractedRequirementFields;
};

const FINAL_MARKERS =
  /\b(one|single|1)\s+(?:final|definitive|polished|finished)\b|\bfinal\s+(?:one|answer|version|result|name|tagline|logo|option)\b|\bexactly\s+(?:one|1)\b|\bjust\s+(?:one|1)\b/i;
const ALTERNATIVE_MARKERS =
  /\b(alternatives?|directions?|options?|variations?|concepts?|routes?|ideas?)\b/i;
const EXPLORATORY_MARKERS =
  /\b(explore|exploratory|brainstorm|ideate|draft|directions?)\b/i;
const RATIONALE_MARKERS =
  /\b(rationale|reasoning|explain(?:ation)?|justify|why)\b/i;

const DIMENSION_RE =
  /(?:size|dimension[s]?|canvas|resolution)?\s*:?\s*(\d{2,5})\s*[×x]\s*(\d{2,5})\s*(?:px|pixels)?/i;
const PAGE_COUNT_RE =
  /\b(one[\-\s]?page|single[\-\s]?page|\b(\d+)\s*[\-\s]?page)\b/i;
const WORD_COUNT_RE =
  /\b(\d+)[\-\s]?word\b|\b(\w+)\s+words?\b/i;
const SENTENCE_COUNT_RE =
  /\b(\d+)\s+(?:sentence|rationale)\b|\b(?:two|three|four|five|six|seven|eight|nine|ten)\s+sentences?\b/i;
const OUTPUT_DELIVERABLE_RE =
  /\boutput\s*:\s*([^.;\n]+)/i;
const EXPORT_DELIVERABLE_RE =
  /\b(?:export|deliver|give me|provide|send|download|save as|get as|convert to|both)\b[^.;\n]*\b(pdf|pptx|docx|html|zip|png|jpg|jpeg|editable\s*text|text|powerpoint|word)\b/gi;
const FORMAT_LIST_RE =
  /\b(pdf|pptx|docx|html|zip|png|jpg|jpeg|editable\s*text)\b(?:\s*(?:and|\+|,|&)\s*(pdf|pptx|docx|html|zip|png|jpg|jpeg|editable\s*text|\btext\b))*/gi;

const NO_CTA_RE =
  /\b(?:no|without|exclude|omit|remove|don't include|do not include)\s+(?:a\s+)?(?:cta|call[\-\s]?to[\-\s]?action)\b|\bcta\s*:\s*(none|no|without)\b/i;

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

function parseNumberWord(token: string): number | undefined {
  const n = NUMBER_WORDS[token.toLowerCase()];
  if (n !== undefined) return n;
  const parsed = Number.parseInt(token, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeDeliverableFormat(raw: string): DeliverableFormat | undefined {
  const t = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (t === "pdf") return "PDF";
  if (t === "pptx" || t === "powerpoint") return "PPTX";
  if (t === "docx" || t === "word") return "DOCX";
  if (t === "html") return "HTML";
  if (t === "zip") return "ZIP";
  if (t === "png") return "PNG";
  if (t === "jpg" || t === "jpeg") return "JPG";
  if (t === "editable text" || t === "editable_text") return "EDITABLE_TEXT";
  if (t === "text" || t === "txt" || t === "copy") return "EDITABLE_TEXT";
  if (t === "mp4") return "MP4";
  return undefined;
}

function dedupeDeliverableFormats(formats: DeliverableFormat[]): DeliverableFormat[] {
  const set = new Set(formats);
  if (set.has("EDITABLE_TEXT")) set.delete("TXT");
  return [...set];
}

function extractDeliverables(text: string): DeliverableFormat[] {
  const found = new Set<DeliverableFormat>();

  const outputMatch = text.match(OUTPUT_DELIVERABLE_RE);
  if (outputMatch?.[1]) {
    for (const part of outputMatch[1].split(/\band\b|[+,/&]/i)) {
      const fmt = normalizeDeliverableFormat(part);
      if (fmt) found.add(fmt);
    }
  }

  let m: RegExpExecArray | null;
  const exportRe = new RegExp(EXPORT_DELIVERABLE_RE.source, "gi");
  while ((m = exportRe.exec(text)) !== null) {
    for (let i = 1; i < m.length; i++) {
      const fmt = normalizeDeliverableFormat(m[i] ?? "");
      if (fmt) found.add(fmt);
    }
  }

  // Scan for all known format tokens (handles "both PPTX and PDF", lists, etc.)
  const tokenRes = [
    /\bpdf\b/gi,
    /\bpptx\b|\bpowerpoint\b/gi,
    /\bdocx\b/gi,
    /\bhtml\b/gi,
    /\bzip\b/gi,
    /\bpng\b/gi,
    /\bjpe?g\b/gi,
    /\bmp4\b/gi,
    /\beditable\s*text\b/gi,
  ];
  for (const re of tokenRes) {
    if (re.test(text)) {
      const probe = text.match(re)?.[0] ?? "";
      const fmt = normalizeDeliverableFormat(probe);
      if (fmt) found.add(fmt);
    }
  }

  return dedupeDeliverableFormats([...found]);
}

function extractDimensions(text: string): { width?: number; height?: number } {
  const m = text.match(DIMENSION_RE);
  if (!m?.[1] || !m[2]) return {};
  const width = Number.parseInt(m[1], 10);
  const height = Number.parseInt(m[2], 10);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return {};
  return { width, height };
}

function extractPageCount(text: string): number | undefined {
  const m = text.match(PAGE_COUNT_RE);
  if (!m) return undefined;
  if (/\bone[\-\s]?page|single[\-\s]?page\b/i.test(m[0])) return 1;
  const n = Number.parseInt(m[2] ?? m[1] ?? "", 10);
  return Number.isFinite(n) ? n : undefined;
}

function extractSentenceCount(text: string): number | undefined {
  const m = text.match(SENTENCE_COUNT_RE);
  if (!m) return undefined;
  if (m[1]) return Number.parseInt(m[1], 10);
  const wordMatch = m[0].match(/\b(two|three|four|five|six|seven|eight|nine|ten)\b/i);
  if (wordMatch?.[1]) return parseNumberWord(wordMatch[1]);
  return undefined;
}

function extractWordCountFromPhrase(phrase: string): number | undefined {
  const m = phrase.match(/\b(\d+)[\-\s]?word\b/i);
  if (m?.[1]) return Number.parseInt(m[1], 10);
  const wordMatch = phrase.match(
    /\b(one|two|three|four|five|six|seven|eight|nine|ten)[\-\s]word\b/i,
  );
  if (wordMatch?.[1]) return parseNumberWord(wordMatch[1]);
  return undefined;
}

/** Extract content items (name, tagline, headline, etc.) with quantities. */
function extractContentItems(text: string): ContentItemSpec[] {
  const items: ContentItemSpec[] = [];
  const lower = text.toLowerCase();

  // "one final six-word tagline" / "one final name"
  const itemPatterns: ReadonlyArray<{
    role: string;
    pattern: RegExp;
  }> = [
    {
      role: "name",
      pattern:
        /\b(?:one|1|a\s+single|exactly\s+one)\s+(?:final\s+)?(?:name|brand\s+name|product\s+name)\b/i,
    },
    {
      role: "tagline",
      pattern:
        /\b(?:one|1|a\s+single|exactly\s+one)\s+(?:final\s+)?(?:(\d+|[a-z]+)[\-\s]word\s+)?tagline\b/i,
    },
    {
      role: "logo",
      pattern:
        /\b(?:one|1|a\s+single|exactly\s+one)\s+(?:final\s+)?logo\b/i,
    },
    {
      role: "headline",
      pattern:
        /\b(?:one|1|a\s+single|exactly\s+one)\s+(?:final\s+)?headline\b/i,
    },
  ];

  for (const { role, pattern } of itemPatterns) {
    const m = text.match(pattern);
    if (m) {
      const wordCount = m[1] ? parseNumberWord(String(m[1])) : extractWordCountFromPhrase(m[0]);
      items.push({
        role,
        quantity: 1,
        wordCount,
        exactness: "exact",
      });
    }
  }

  // "5 naming directions" / "3 alternatives" / "create 5 options"
  const quantityMatch = text.match(
    /\b(?:create|give|provide|generate|make|show)\s+(?:me\s+)?(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:(?:[\w-]+\s+){0,2})?(names?|taglines?|logos?|headlines?|options?|directions?|alternatives?|concepts?|variations?)\b/i,
  );
  if (quantityMatch) {
    const qty = parseNumberWord(quantityMatch[1] ?? "") ?? 1;
    const noun = (quantityMatch[2] ?? "").toLowerCase();
    const role = noun.replace(/s$/, "").replace(/directions?/, "direction").replace(/alternatives?/, "alternative");
    if (!items.some((i) => i.role === role)) {
      items.push({
        role,
        quantity: qty,
        exactness: qty === 1 && FINAL_MARKERS.test(text) ? "exact" : undefined,
      });
    }
  }

  // Generic quantity from signals when no specific item found
  if (items.length === 0 && /\b(\d+)\s+(options?|directions?|alternatives?)\b/i.test(lower)) {
    const m = text.match(/\b(\d+)\s+(options?|directions?|alternatives?)\b/i);
    if (m?.[1]) {
      items.push({
        role: "option",
        quantity: Number.parseInt(m[1], 10),
      });
    }
  }

  return items;
}

function extractOutputMode(text: string, signals: SemanticSignals): OutputIntentMode | undefined {
  if (FINAL_MARKERS.test(text)) return "FINAL";
  if (signals.isVariation || ALTERNATIVE_MARKERS.test(text)) return "ALTERNATIVES";
  if (EXPLORATORY_MARKERS.test(text)) return "EXPLORATORY";
  if (signals.isModification && signals.quantityHint !== "multiple") return "REFINEMENT";
  if (signals.quantityHint === "single") return "FINAL";
  if (signals.quantityHint === "multiple") return "ALTERNATIVES";
  return undefined;
}

function extractQuantity(text: string, contentItems: readonly ContentItemSpec[]): number | undefined {
  if (contentItems.length === 1 && contentItems[0]!.quantity === 1) return 1;
  const maxItemQty = contentItems.reduce((max, i) => Math.max(max, i.quantity), 0);
  if (maxItemQty > 1) return maxItemQty;

  const m = text.match(
    /\b(?:create|give|provide|generate|make|show)\s+(?:me\s+)?(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:(?:[\w-]+\s+){0,2})?(?:final\s+)?(?:options?|directions?|alternatives?|names?|logos?|concepts?)\b/i,
  );
  if (m?.[1]) return parseNumberWord(m[1]);

  if (FINAL_MARKERS.test(text)) return 1;
  return undefined;
}

function requirementsToFields(
  requirements: readonly ConversationalRequirement[],
): Partial<ExtractedRequirementFields> {
  const active = requirements.filter((r) => r.status === "active");
  const partial: {
    -readonly [K in keyof ExtractedRequirementFields]?: ExtractedRequirementFields[K];
  } = { explicit: true };

  for (const req of active) {
    if (req.key === "objective") partial.objective = req.value;
    if (req.key === "cta" && /\b(no|none|without|remove)\b/i.test(req.value)) {
      partial.ctaRequired = false;
    }
    if (req.key === "format") {
      const deliverables = extractDeliverables(req.value);
      if (deliverables.length) partial.deliverables = deliverables;
    }
    if (req.key === "tone") partial.tone = req.value;
    if (req.key === "palette" || req.key === "style") partial.style = req.value;
    if (req.key === "constraint") {
      partial.positiveConstraints = [
        ...(partial.positiveConstraints ?? []),
        req.value,
      ];
    }
    if (req.key === "negative_constraint") {
      partial.negativeConstraints = [
        ...(partial.negativeConstraints ?? []),
        negativeConstraintSpec(req.value),
      ];
    }
  }
  return partial;
}

export const deterministicRequirementFieldInterpreter: RequirementFieldInterpreter = {
  interpret(input) {
    const text = input.message.trim();
    const fromRequirements = requirementsToFields(input.requirements);
    const contentItems = extractContentItems(text);
    const deliverables = extractDeliverables(text);
    const dims = extractDimensions(text);
    const pageCount = extractPageCount(text);
    const sentenceCount = extractSentenceCount(text);
    const outputMode = extractOutputMode(text, input.signals);
    const quantity = extractQuantity(text, contentItems);
    const rationaleRequired = RATIONALE_MARKERS.test(text);
    const rationaleSentenceCount = rationaleRequired ? sentenceCount : undefined;
    const ctaRequired = NO_CTA_RE.test(text) ? false : undefined;
    const messageNegatives = extractNegativeConstraintsFromMessage(text);
    const brandAssetRequired = extractBrandAssetRequirementFromMessage(text);

    const hasExplicit =
      deliverables.length > 0 ||
      contentItems.length > 0 ||
      dims.width !== undefined ||
      pageCount !== undefined ||
      outputMode !== undefined ||
      quantity !== undefined ||
      rationaleRequired ||
      ctaRequired === false ||
      messageNegatives.length > 0 ||
      Boolean(brandAssetRequired) ||
      Boolean(input.objective);

    const mergedNegatives = [
      ...(fromRequirements.negativeConstraints ?? []),
      ...messageNegatives,
    ];
    const dedupedNegatives = [
      ...new Map(
        mergedNegatives.map((c) => [c.normalizedConcept, c] as const),
      ).values(),
    ];

    return Object.freeze({
      objective: input.objective ?? (text.length > 20 ? text : undefined),
      quantity,
      exactness: outputMode === "FINAL" || FINAL_MARKERS.test(text) ? "exact" : undefined,
      sentenceCount,
      ctaRequired,
      contentItems: contentItems.length ? contentItems : undefined,
      width: dims.width,
      height: dims.height,
      pageCount,
      deliverables: deliverables.length ? deliverables : undefined,
      outputMode,
      alternativesRequested:
        outputMode === "ALTERNATIVES" ||
        input.signals.isVariation ||
        ALTERNATIVE_MARKERS.test(text)
          ? true
          : outputMode === "FINAL"
            ? false
            : undefined,
      rationaleRequired: rationaleRequired || undefined,
      rationaleSentenceCount,
      negativeConstraints: dedupedNegatives.length ? dedupedNegatives : undefined,
      brandAssetRequired: brandAssetRequired?.required,
      explicit: hasExplicit || fromRequirements.explicit === true,
      ...fromRequirements,
      // Message-level explicit fields override requirement ledger for same turn
      ...(deliverables.length ? { deliverables } : {}),
      ...(contentItems.length ? { contentItems } : {}),
      ...(outputMode ? { outputMode } : {}),
      ...(quantity !== undefined ? { quantity } : {}),
    });
  },
};

export function interpretRequirementFields(
  input: Parameters<RequirementFieldInterpreter["interpret"]>[0],
  interpreter: RequirementFieldInterpreter = deterministicRequirementFieldInterpreter,
): ExtractedRequirementFields {
  return interpreter.interpret(input);
}
