/**
 * Deterministic requirement extractor (M2).
 * AI extraction is not automatic-as-explicit; only deterministic/explicit paths here.
 */

import {
  createRequirementId,
  checksumText,
} from "./ids";
import type {
  CdfExtractionMethod,
  CdfRequirement,
  CdfRequirementCategory,
  CdfRequirementPriority,
  CdfRequirementValue,
  CdfSourceInput,
  CdfSourceInputType,
} from "./types";

function nowIso(): string {
  return new Date().toISOString();
}

function displayOf(value: CdfRequirementValue): string {
  switch (value.kind) {
    case "string":
    case "enum":
    case "color":
      return value.value;
    case "number":
    case "boolean":
      return String(value.value);
    case "string[]":
    case "number[]":
      return value.value.join(", ");
    case "dimension":
      return `${value.value.width}x${value.value.height}${value.value.unit}`;
    case "range":
      return `${value.value.min}-${value.value.max}`;
    case "object":
      return JSON.stringify(value.value);
  }
}

function req(input: {
  sessionId: string;
  serviceId: string;
  projectId?: string;
  source: CdfSourceInput;
  key: string;
  value: CdfRequirementValue;
  category: CdfRequirementCategory;
  priority?: CdfRequirementPriority;
  explicit?: boolean;
  method?: CdfExtractionMethod;
  confidence?: number;
  supersedesRequirementId?: string;
}): CdfRequirement {
  const explicit = input.explicit ?? true;
  const priority =
    input.priority ??
    (explicit
      ? "explicit_current_user_instruction"
      : "ai_inference");
  const confidence = input.confidence ?? (explicit ? 1 : 0.5);
  const method =
    input.method ?? (explicit ? "explicit" : "ai_inferred");
  const ts = nowIso();
  return {
    requirementId: createRequirementId(),
    projectId: input.projectId,
    sessionId: input.sessionId,
    serviceId: input.serviceId,
    key: input.key,
    value: input.value,
    displayValue: displayOf(input.value),
    category: input.category,
    priority,
    provenance: {
      sourceInputId: input.source.sourceInputId,
      sourceType: input.source.type,
      extractionMethod: method,
      explicit,
      confidence,
    },
    status: "active",
    confidence,
    explicit,
    ...(input.supersedesRequirementId
      ? { supersedesRequirementId: input.supersedesRequirementId }
      : {}),
    createdAt: ts,
    updatedAt: ts,
  };
}

const PLATFORM_WORDS = [
  "instagram",
  "facebook",
  "linkedin",
  "twitter",
  "x.com",
  "tiktok",
  "youtube",
  "pinterest",
  "whatsapp",
];

const COLOR_NAME_TO_KEY: Record<string, string> = {
  "dark navy": "dark_navy",
  navy: "navy",
  white: "white",
  black: "black",
  green: "green",
  red: "red",
  blue: "blue",
  gold: "gold",
};

const SECTION_ALIASES: Array<{ re: RegExp; key: string }> = [
  { re: /\bproblem\b/i, key: "problem" },
  { re: /\bsolution\b/i, key: "solution" },
  { re: /\bmarket\b/i, key: "market" },
  { re: /\bproduct\b/i, key: "product" },
  { re: /\bbusiness\s*model\b/i, key: "business_model" },
  { re: /\btraction\b/i, key: "traction" },
  { re: /\bcompetition\b/i, key: "competition" },
  { re: /\b(?:gtm|go[- ]to[- ]market)\b/i, key: "gtm" },
  { re: /\bteam\b/i, key: "team" },
  { re: /\bfinancials?\b/i, key: "financials" },
  { re: /\bask\b/i, key: "ask" },
];

const TONE_WORDS = [
  "premium",
  "credible",
  "professional",
  "playful",
  "bold",
  "minimal",
  "luxury",
  "friendly",
  "modern",
  "corporate",
];

function isClearOverride(text: string): boolean {
  return /\b(actually|instead|change|switch|replace|make the|use .+ instead|no longer|not .+ anymore)\b/i.test(
    text,
  );
}

function isAmbiguousStyleNudge(text: string): boolean {
  return (
    /\b(more premium|feel more|can we make it|slightly|a bit more|elevate)\b/i.test(
      text,
    ) && !isClearOverride(text)
  );
}

/**
 * Extract requirements from a single SourceInput.
 * Does not mutate historical requirements — caller runs the resolver.
 */
export function extractRequirementsFromSource(
  source: CdfSourceInput,
  opts?: { projectId?: string },
): CdfRequirement[] {
  const text = source.rawContent.trim();
  if (!text) return [];

  const base = {
    sessionId: source.sessionId,
    serviceId: source.serviceId,
    projectId: opts?.projectId ?? source.projectId,
    source,
  };

  const out: CdfRequirement[] = [];

  // Selection / approval adapters — structured metadata preferred
  if (source.type === "selection" || source.type === "legacy_select_compat") {
    const phaseId = String(source.metadata?.phaseId ?? "selection");
    const label = String(
      source.metadata?.selectedRouteLabel ??
        source.metadata?.routeTitle ??
        text,
    );
    out.push(
      req({
        ...base,
        key: `selection.${phaseId}`,
        value: { kind: "string", value: label },
        category: "preference",
        priority: "explicit_current_user_instruction",
        method: "user_selection",
        explicit: true,
      }),
    );
    return out;
  }

  if (source.type === "approval") {
    const phaseId = String(source.metadata?.phaseId ?? "approval");
    out.push(
      req({
        ...base,
        key: `approval.${phaseId}`,
        value: {
          kind: "object",
          value: {
            phaseId,
            artifactId: source.metadata?.artifactId,
            executionId: source.metadata?.executionId,
            note: source.metadata?.note,
          },
        },
        category: "constraint",
        priority: "approved_user_decision",
        method: "approved_decision",
        explicit: true,
      }),
    );
    return out;
  }

  if (source.type === "uploaded_file" || source.type === "uploaded_image" || source.type === "reference") {
    const refId = String(source.metadata?.assetId ?? source.metadata?.fileId ?? source.sourceInputId);
    out.push(
      req({
        ...base,
        key: "reference.asset",
        value: {
          kind: "object",
          value: {
            refId,
            mimeType: source.metadata?.mimeType,
            fileName: source.metadata?.fileName,
          },
        },
        category: "reference",
        priority: "user_provided_source_reference",
        method: "source_document",
        explicit: true,
      }),
    );
    // Do not duplicate binary content — rawContent may hold a pointer/description only.
    return out;
  }

  // --- Deterministic text extraction ---

  const slideMatch = text.match(
    /\b(\d{1,3})\s*[- ]?\s*slides?\b/i,
  );
  if (slideMatch) {
    out.push(
      req({
        ...base,
        key: "slide_count",
        value: { kind: "number", value: Number(slideMatch[1]) },
        category: "quantity",
      }),
    );
  }

  const dimMatch = text.match(
    /\b(\d{2,5})\s*[x×]\s*(\d{2,5})\b/i,
  );
  if (dimMatch) {
    out.push(
      req({
        ...base,
        key: "dimensions",
        value: {
          kind: "dimension",
          value: {
            width: Number(dimMatch[1]),
            height: Number(dimMatch[2]),
            unit: "px",
          },
        },
        category: "dimension",
      }),
    );
  }

  for (const p of PLATFORM_WORDS) {
    if (new RegExp(`\\b${p.replace(".", "\\.")}\\b`, "i").test(text)) {
      out.push(
        req({
          ...base,
          key: "platform",
          value: { kind: "enum", value: p === "x.com" ? "twitter" : p },
          category: "platform",
        }),
      );
      break;
    }
  }

  const audienceMatch = text.match(
    /\b(?:audience|target(?:\s+audience)?)\s*(?:is|:|=|-)?\s*([^.!\n]{2,80})/i,
  );
  if (audienceMatch?.[1]) {
    out.push(
      req({
        ...base,
        key: "audience",
        value: { kind: "string", value: audienceMatch[1].trim() },
        category: "audience",
      }),
    );
  } else if (/\bseries\s*[abc]\s+investors?\b/i.test(text)) {
    const m = text.match(/\b(series\s*[abc]\s+investors?)\b/i);
    if (m?.[1]) {
      out.push(
        req({
          ...base,
          key: "audience",
          value: { kind: "string", value: m[1].trim() },
          category: "audience",
        }),
      );
    }
  }

  // Background / text / accent colors
  const bgMatch =
    text.match(
      /\b(?:primary\s+)?background\s*(?:(?:color|colour)\s*)?(?:is|:|=|to)?\s*(dark\s+navy|navy|white|black|#[0-9a-fA-F]{3,8}|[a-z]+)/i,
    ) ||
    text.match(
      /\buse\s+(a\s+)?(dark\s+navy|navy|white|black|#[0-9a-fA-F]{3,8})\s+(?:as\s+(?:the\s+)?)?(?:primary\s+)?background\b/i,
    ) ||
    text.match(
      /\buse\s+(dark\s+navy|navy|white|black)\s+as\s+the\s+primary\s+background\b/i,
    );
  if (bgMatch) {
    const raw = (bgMatch[2] ?? bgMatch[1] ?? "").trim().toLowerCase();
    if (raw) {
      out.push(
        req({
          ...base,
          key: "primary_background",
          value: {
            kind: "color",
            value: COLOR_NAME_TO_KEY[raw] ?? raw.replace(/\s+/g, "_"),
          },
          category: "color",
          method: isClearOverride(text) ? "user_override" : "explicit",
          priority: isClearOverride(text)
            ? "explicit_user_override"
            : "explicit_current_user_instruction",
        }),
      );
    }
  }

  // "make the background white"
  const bgOverride = text.match(
    /\bmake\s+the\s+background\s+(dark\s+navy|navy|white|black|#[0-9a-fA-F]{3,8}|[a-z]+)\b/i,
  );
  if (bgOverride?.[1] && !bgMatch) {
    const raw = bgOverride[1].trim().toLowerCase();
    out.push(
      req({
        ...base,
        key: "primary_background",
        value: {
          kind: "color",
          value: COLOR_NAME_TO_KEY[raw] ?? raw.replace(/\s+/g, "_"),
        },
        category: "color",
        method: "user_override",
        priority: "explicit_user_override",
      }),
    );
  }

  const textColorMatch = text.match(
    /\b(?:use\s+)?white\s+text\b|\btext\s*(?:color|colour)\s*(?:is|:|=)?\s*(white|black|#[0-9a-fA-F]{3,8})/i,
  );
  if (textColorMatch) {
    const v = (textColorMatch[1] ?? "white").toLowerCase();
    out.push(
      req({
        ...base,
        key: "text_color",
        value: { kind: "color", value: v },
        category: "color",
      }),
    );
  }

  const accentMatch = text.match(
    /\b(?:accent(?:\s+color|\s+colour)?|use\s+(\w+)\s+as\s+the\s+accent)\b/i,
  );
  if (accentMatch) {
    const named = text.match(
      /\buse\s+(green|red|blue|gold|teal|orange)\s+as\s+(?:the\s+)?accent\b/i,
    );
    const v = (named?.[1] ?? accentMatch[1] ?? "").toLowerCase();
    if (v) {
      out.push(
        req({
          ...base,
          key: "accent_color",
          value: { kind: "color", value: v },
          category: "color",
        }),
      );
    }
  }

  // Hex colors as brand palette (explicit mentions)
  const hexes = text.match(/#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g) ?? [];
  if (hexes.length) {
    out.push(
      req({
        ...base,
        key: "brand_colors",
        value: { kind: "string[]", value: [...new Set(hexes)].slice(0, 12) },
        category: "color",
      }),
    );
  }

  // Forbidden / do not
  if (
    /\bdo\s+not\s+(?:invent\s+)?(?:revenue|numbers?|projections?)\b/i.test(text) ||
    /\bdon'?t\s+invent\s+revenue\b/i.test(text) ||
    /\bdo\s+not\s+mention\s+revenue\b/i.test(text)
  ) {
    out.push(
      req({
        ...base,
        key: "forbidden.invented_revenue_numbers",
        value: { kind: "string", value: "invented_revenue_numbers" },
        category: "forbidden_content",
      }),
    );
  }

  const forbidColor = text.match(
    /\b(?:do\s+not\s+use|don'?t\s+use|avoid|never\s+use)\s+(red|blue|green|yellow|purple|orange|pink|black|white)\b/i,
  );
  if (forbidColor?.[1]) {
    out.push(
      req({
        ...base,
        key: `forbidden.color.${forbidColor[1].toLowerCase()}`,
        value: { kind: "color", value: forbidColor[1].toLowerCase() },
        category: "forbidden_content",
      }),
    );
  }

  // Mandatory sections (presentation-style include lists)
  if (/\binclude\b/i.test(text)) {
    const sections: string[] = [];
    for (const s of SECTION_ALIASES) {
      if (s.re.test(text)) sections.push(s.key);
    }
    if (sections.length >= 3) {
      out.push(
        req({
          ...base,
          key: "mandatory_sections",
          value: { kind: "string[]", value: sections },
          category: "mandatory_content",
        }),
      );
    }
  }

  // Tone / style — explicit adjectives in text are explicit requirements
  // Inferring "premium means black/gold/serif" is NOT done here (would be ai_inference).
  const lower = text.toLowerCase();
  for (const tone of TONE_WORDS) {
    if (new RegExp(`\\b${tone}\\b`, "i").test(lower)) {
      out.push(
        req({
          ...base,
          key: `tone.${tone}`,
          value: { kind: "string", value: tone },
          category: "tone",
          // Ambiguous nudges still add explicit "premium" but must not wipe colors (resolver).
          priority: isAmbiguousStyleNudge(text)
            ? "explicit_current_user_instruction"
            : "explicit_current_user_instruction",
        }),
      );
    }
  }

  if (/\binvestor\s+presentation\b/i.test(text)) {
    out.push(
      req({
        ...base,
        key: "presentation_type",
        value: { kind: "enum", value: "investor" },
        category: "format",
      }),
    );
  }

  if (/\bB2B\s+SaaS\b/i.test(text) || /\bSaaS\s+company\b/i.test(text)) {
    out.push(
      req({
        ...base,
        key: "industry",
        value: { kind: "string", value: "B2B SaaS" },
        category: "brand",
      }),
    );
  }

  // Refinement: keep raw as content constraint
  if (source.type === "refinement") {
    out.push(
      req({
        ...base,
        key: "refinement.instruction",
        value: { kind: "string", value: text },
        category: "constraint",
      }),
    );
  }

  // Always retain a whole-brief content anchor so truncation cannot erase intent.
  // Key is stable for primary user_prompt; additional messages accumulate as content.note.*
  if (source.type === "user_prompt" || source.type === "user_message") {
    out.push(
      req({
        ...base,
        key:
          source.type === "user_prompt"
            ? "brief.raw"
            : `brief.message.${source.sequence}`,
        value: { kind: "string", value: text },
        category: "content",
        confidence: 1,
      }),
    );
  }

  void checksumText; // available for callers
  return out;
}

export function extractRequirements(
  sources: CdfSourceInput[],
): CdfRequirement[] {
  const all: CdfRequirement[] = [];
  for (const s of sources) {
    all.push(...extractRequirementsFromSource(s));
  }
  return all;
}

export function sourceTypeForDecision(
  kind: "selection" | "approval" | "legacy_select_compat",
): CdfSourceInputType {
  return kind;
}
