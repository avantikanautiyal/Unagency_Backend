/**
 * Brand Learning — Phase 3: Prompt Signal Learner
 *
 * Scans a user's raw prompt for explicit brand signals and persists them to:
 *   1. The selected product Brand (Mongo SoT — colors / voice / guidelinesProfile)
 *   2. Org Brand Brain (enrichment layer)
 *
 * Only meaningful signals (high-confidence matches) are persisted so we
 * don't pollute the brand profile with noise.
 */

import mongoose from "mongoose";
import type { IBrandBrainEngine } from "../interfaces";
import type { BrandBrainDocument } from "../contracts/knowledge";
import type { BrandContext } from "../../../os/brand/contracts/brand-context";
import { emptyBrandBrainDocument } from "./refinement-signal-learner";
import Brands from "../../../../models/brand.model";
import { toBrandDto } from "../../../../services/brand-service";
import { syncProductBrandToBrain } from "../../../../services/brand-brain-sync-service";

// ---------------------------------------------------------------------------
// Signal extraction
// ---------------------------------------------------------------------------

const COLOR_NAMES = [
  "red", "blue", "green", "yellow", "orange", "purple", "violet", "pink",
  "black", "white", "grey", "gray", "brown", "beige", "cream", "ivory",
  "gold", "silver", "bronze", "teal", "cyan", "magenta", "indigo", "maroon",
  "navy", "turquoise", "coral", "salmon", "khaki", "lilac", "lavender",
  "peach", "mint", "olive", "charcoal", "rose", "crimson", "emerald",
  "cobalt", "sapphire", "amber", "saffron", "ochre", "rust", "chocolate",
];

const TONE_ADJECTIVES = [
  "minimalist", "minimal", "luxurious", "luxury", "bold", "clean", "elegant",
  "vibrant", "playful", "modern", "classic", "traditional", "sophisticated",
  "premium", "affordable", "youthful", "professional", "casual", "formal",
  "friendly", "authoritative", "edgy", "refined", "understated", "opulent",
  "rustic", "urban", "corporate", "artisan", "artisanal", "fresh", "natural",
  "organic", "sustainable", "tech", "futuristic", "retro", "vintage",
  "handmade", "bespoke", "exclusive", "inclusive", "warm", "cool", "bright",
  "dark", "muted", "saturated", "pastel", "monochrome", "geometric",
];

const TYPOGRAPHY_HINTS = [
  "serif", "sans-serif", "sans serif", "script", "handwritten",
  "bold font", "light font", "thin font", "display font", "slab serif",
];

const AVOID_PATTERNS = [
  /\b(?:avoid|no|don['']t use|do not use|without|exclude|skip)\s+([\w\s]{3,40}?)(?:[,.]|$)/gi,
];

const HEX_PATTERN = /#([0-9a-fA-F]{3,6})\b/g;

/** Prefer the raw user brief when product/brand blocks were prepended. */
export function isolateUserBrief(prompt: string): string {
  const markers = [
    /\[User prompt\]\s*/i,
    /\[User brief\]\s*/i,
    /Original client brief:\s*/i,
  ];
  for (const marker of markers) {
    const idx = prompt.search(marker);
    if (idx >= 0) {
      const match = prompt.slice(idx).match(marker);
      const start = idx + (match?.[0]?.length ?? 0);
      return prompt.slice(start).trim() || prompt.trim();
    }
  }
  // Drop injected product-selection / selected-brand blocks if present.
  return prompt
    .replace(/\[Product selection[\s\S]*?(?=\[|$)/gi, " ")
    .replace(/\[Selected brand[\s\S]*?(?=\[|$)/gi, " ")
    .replace(/\[Knowledge status[^\]]*\]/gi, " ")
    .replace(/\[Brand name[^\]]*\]/gi, " ")
    .trim();
}

function extractColors(prompt: string): string[] {
  const found: string[] = [];

  const hexMatches = [...prompt.matchAll(HEX_PATTERN)];
  for (const m of hexMatches) {
    found.push(`#${m[1]!.toLowerCase()}`);
  }

  // Explicit colour list: "brand colors being white beige and peach"
  // or "colours: white, beige, peach"
  const listMatch = prompt.match(
    /\b(?:brand\s+)?(?:colou?rs?|palette|scheme)\b[\s:,-]*(?:being|are|is|=|:)?\s*([^.!?\n]{3,120})/i,
  );
  if (listMatch?.[1]) {
    const chunk = listMatch[1].toLowerCase();
    for (const color of COLOR_NAMES) {
      if (new RegExp(`\\b${color}\\b`, "i").test(chunk)) {
        found.push(color);
      }
    }
  }

  const lower = prompt.toLowerCase();
  for (const color of COLOR_NAMES) {
    const re = new RegExp(
      `(?:\\b(?:deep|dark|light|bright|warm|cool|soft|muted|rich|vibrant|pastel)\\s+)?\\b${color}\\b`,
      "i",
    );
    if (!re.test(lower)) continue;
    const at = lower.indexOf(color);
    const window = prompt.slice(Math.max(0, at - 80), at + 80);
    const creativeContext =
      /(?:color|colour|palette|tone|hue|shade|background|brand|logo|design|theme|scheme)/i.test(
        window,
      );
    if (!creativeContext) continue;
    const adjMatch = prompt.match(
      new RegExp(
        `((?:deep|dark|light|bright|warm|cool|soft|muted|rich|vibrant|pastel)\\s+)?${color}`,
        "i",
      ),
    );
    found.push((adjMatch?.[0] ?? color).trim());
  }

  return [...new Set(found.map((c) => c.trim().toLowerCase()).filter(Boolean))];
}

function extractTone(prompt: string): string[] {
  const found: string[] = [];
  const lower = prompt.toLowerCase();
  for (const adj of TONE_ADJECTIVES) {
    if (lower.includes(adj)) found.push(adj);
  }
  return [...new Set(found)];
}

/** Free-form voice / tone sentences the user stated explicitly. */
function extractVoiceNotes(prompt: string): string[] {
  const found: string[] = [];
  const patterns = [
    /\b(?:brand(?:'s)?\s+)?(?:voice|tone(?:\s+of\s+voice)?)\b[\s:,-]*(?:being|is|should\s+be|=|:)?\s*([^.!?\n]{4,120})/gi,
    /\b(?:speak|sound|write)\s+(?:in\s+a\s+)?([^.!?\n]{4,80})\s+(?:voice|tone)\b/gi,
  ];
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(prompt)) !== null) {
      const note = m[1]?.trim().replace(/\s+/g, " ");
      if (note && note.length >= 4) found.push(note);
    }
  }
  return [...new Set(found)];
}

function extractAvoids(prompt: string): string[] {
  const found: string[] = [];
  for (const pattern of AVOID_PATTERNS) {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(prompt)) !== null) {
      const thing = m[1]?.trim();
      if (thing && thing.length >= 3 && thing.split(" ").length <= 6) {
        found.push(thing.toLowerCase());
      }
    }
  }
  return [...new Set(found)];
}

function extractTypography(prompt: string): string[] {
  const found: string[] = [];
  const lower = prompt.toLowerCase();
  for (const hint of TYPOGRAPHY_HINTS) {
    if (lower.includes(hint)) found.push(hint);
  }
  return [...new Set(found)];
}

export interface PromptSignals {
  colors: string[];
  toneAdjectives: string[];
  voiceNotes: string[];
  avoidList: string[];
  typography: string[];
  styleNotes: string[];
}

/** Extract all brand signals from a raw user prompt. */
export function extractPromptSignals(prompt: string): PromptSignals {
  const brief = isolateUserBrief(prompt);
  if (!brief || brief.length < 10) {
    return {
      colors: [],
      toneAdjectives: [],
      voiceNotes: [],
      avoidList: [],
      typography: [],
      styleNotes: [],
    };
  }

  const colors = extractColors(brief);
  const toneAdjectives = extractTone(brief);
  const voiceNotes = extractVoiceNotes(brief);
  const avoidList = extractAvoids(brief);
  const typography = extractTypography(brief);

  const styleNotes: string[] = [];
  const styleKeywords =
    /\b(?:style|aesthetic|vibe|feel|look|tone|colour|color|font|typography|logo|palette|brand|design|voice)\b/i;
  const sentences = brief
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const sentence of sentences) {
    if (styleKeywords.test(sentence) && sentence.length > 20 && sentence.length < 200) {
      styleNotes.push(sentence.trim());
    }
  }

  return {
    colors,
    toneAdjectives,
    voiceNotes,
    avoidList,
    typography,
    styleNotes,
  };
}

export function hasSignificantSignals(signals: PromptSignals): boolean {
  return (
    signals.colors.length > 0 ||
    signals.toneAdjectives.length > 0 ||
    signals.voiceNotes.length > 0 ||
    signals.avoidList.length > 0 ||
    signals.typography.length > 0
  );
}

function dedupe(arr: readonly string[], additions: string[]): readonly string[] {
  const set = new Set(
    [...arr, ...additions.map((s) => s.trim()).filter(Boolean)].map((s) =>
      s.toLowerCase() === s ? s : s,
    ),
  );
  // Preserve first-seen casing by rebuilding carefully
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of [...arr, ...additions]) {
    const key = item.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item.trim());
  }
  void set;
  return out;
}

async function mergeSignalsIntoProductBrand(input: {
  organizationId: string;
  brandId: string;
  signals: PromptSignals;
}): Promise<boolean> {
  if (!mongoose.isValidObjectId(input.brandId)) return false;
  if (!mongoose.isValidObjectId(input.organizationId)) return false;

  const doc = await Brands.findOne({
    _id: new mongoose.Types.ObjectId(input.brandId),
    organizationId: new mongoose.Types.ObjectId(input.organizationId),
    status: { $ne: "archived" },
  });
  if (!doc) return false;

  const gp = {
    ...((doc.guidelinesProfile ?? {}) as Record<string, unknown>),
  };
  let changed = false;

  if (input.signals.colors.length) {
    const nextColors = [
      ...dedupe(doc.colors ?? [], input.signals.colors),
    ] as string[];
    if (nextColors.join("|") !== (doc.colors ?? []).join("|")) {
      doc.colors = nextColors;
      changed = true;
    }
    const primary = dedupe(
      Array.isArray(gp.primaryColors)
        ? (gp.primaryColors as string[])
        : [],
      input.signals.colors,
    );
    if (
      primary.join("|") !==
      (Array.isArray(gp.primaryColors)
        ? (gp.primaryColors as string[]).join("|")
        : "")
    ) {
      gp.primaryColors = [...primary];
      changed = true;
    }
  }

  if (input.signals.toneAdjectives.length || input.signals.voiceNotes.length) {
    const toneParts = [
      typeof gp.tone === "string" ? gp.tone : "",
      ...input.signals.toneAdjectives,
      ...input.signals.voiceNotes,
    ]
      .map((s) => s.trim())
      .filter(Boolean);
    const tone = [...new Set(toneParts)].join(", ");
    if (tone && tone !== gp.tone) {
      gp.tone = tone;
      changed = true;
    }
    // Always promote learned tone into the product brand voice field so the
    // Brand screen + Brand Intelligence see it on the next (and this) read.
    if (tone && tone !== (doc.voice ?? "").trim()) {
      doc.voice = tone;
      changed = true;
    }
    if (input.signals.toneAdjectives.length) {
      const personality = dedupe(
        typeof gp.brandPersonality === "string"
          ? gp.brandPersonality.split(/,\s*/)
          : [],
        input.signals.toneAdjectives,
      ).join(", ");
      if (personality && personality !== gp.brandPersonality) {
        gp.brandPersonality = personality;
        changed = true;
      }
    }
  }

  if (input.signals.avoidList.length) {
    const words = dedupe(
      Array.isArray(gp.wordsToAvoid) ? (gp.wordsToAvoid as string[]) : [],
      input.signals.avoidList,
    );
    gp.wordsToAvoid = [...words];
    changed = true;
  }

  if (input.signals.typography.length) {
    const typography = dedupe(
      typeof gp.typography === "string" ? gp.typography.split(/,\s*/) : [],
      input.signals.typography,
    ).join(", ");
    if (typography && typography !== gp.typography) {
      gp.typography = typography;
      changed = true;
    }
  }

  if (input.signals.styleNotes.length) {
    const noteBlock = input.signals.styleNotes.slice(0, 3).join(" | ");
    const existing =
      typeof gp.voiceGuidelines === "string" ? gp.voiceGuidelines : "";
    if (noteBlock && !existing.includes(noteBlock.slice(0, 40))) {
      gp.voiceGuidelines = existing
        ? `${existing}\n${noteBlock}`
        : noteBlock;
      changed = true;
    }
  }

  if (!changed) return false;

  doc.guidelinesProfile = gp;
  doc.markModified("guidelinesProfile");
  await doc.save();

  try {
    await syncProductBrandToBrain(toBrandDto(doc));
  } catch {
    // brain sync is best-effort
  }

  console.log(
    `🧠 [AI OS] brand learned from prompt | brandId=${input.brandId} | colours=${input.signals.colors.slice(0, 4).join(",") || "—"} | tone=${input.signals.toneAdjectives.slice(0, 3).join(",") || input.signals.voiceNotes[0] || "—"}`,
  );
  return true;
}

/** Pull brandId from prompt tags when metadata omitted it. */
export function resolveBrandIdFromPrompt(prompt: string): string | undefined {
  const patterns = [
    /\bid=([a-fA-F0-9]{24})\b/,
    /\bbrandId[=:]\s*([a-fA-F0-9]{24})\b/i,
  ];
  for (const pattern of patterns) {
    const m = prompt.match(pattern);
    if (m?.[1]) return m[1];
  }
  return undefined;
}

/**
 * Overlay prompt-learned colours / voice onto Brand Context for this run so
 * generation uses them even if the Mongo write races or the UI hasn't refreshed.
 */
export function applyPromptSignalsToBrandContext(
  ctx: BrandContext,
  signals: PromptSignals,
): BrandContext {
  if (!hasSignificantSignals(signals)) return ctx;

  const colors = [
    ...new Set([
      ...(ctx.visualIdentity.colors ?? []),
      ...(ctx.visualIdentity.primaryColors ?? []),
      ...signals.colors,
    ]),
  ];
  const toneParts = [
    ctx.tone.tone,
    ...signals.toneAdjectives,
    ...signals.voiceNotes,
  ]
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter(Boolean);
  const tone = [...new Set(toneParts)].join(", ") || ctx.tone.tone;
  const voice =
    tone ||
    ctx.voice.voice ||
    [...signals.voiceNotes, ...signals.toneAdjectives].join(", ") ||
    undefined;
  const avoid = [
    ...new Set([
      ...(ctx.vocabulary.avoid ?? []),
      ...signals.avoidList,
    ]),
  ];
  const typography = [
    ctx.visualIdentity.typography,
    ...signals.typography,
  ]
    .filter(Boolean)
    .join(", ") || ctx.visualIdentity.typography;

  const status =
    ctx.status === "MISSING" || ctx.status === "EMPTY"
      ? ("PARTIAL" as const)
      : ctx.status;

  return {
    ...ctx,
    status,
    tone: {
      ...ctx.tone,
      ...(tone ? { tone } : {}),
      adjectives: [
        ...new Set([
          ...(ctx.tone.adjectives ?? []),
          ...signals.toneAdjectives,
        ]),
      ],
    },
    voice: {
      ...ctx.voice,
      ...(voice ? { voice } : {}),
      ...(signals.toneAdjectives.length
        ? {
            personality: [
              ...new Set(
                [
                  ctx.voice.personality,
                  ...signals.toneAdjectives,
                ]
                  .filter(Boolean)
                  .flatMap((s) => String(s).split(/,\s*/)),
              ),
            ].join(", "),
          }
        : {}),
    },
    vocabulary: {
      ...ctx.vocabulary,
      ...(avoid.length ? { avoid } : {}),
    },
    visualIdentity: {
      ...ctx.visualIdentity,
      ...(colors.length ? { colors, primaryColors: colors } : {}),
      ...(typography ? { typography } : {}),
    },
    provenance: [
      ...ctx.provenance,
      ...(signals.colors.length
        ? [
            {
              field: "colors",
              value: signals.colors.join(","),
              source: "USER_INPUT" as const,
            },
          ]
        : []),
      ...(tone
        ? [
            {
              field: "tone",
              value: tone,
              source: "USER_INPUT" as const,
            },
          ]
        : []),
    ],
  };
}

/**
 * Persist extracted prompt signals into the selected product brand + BrandBrain.
 * Best-effort — never throws; never blocks execution fatally.
 */
export async function learnFromPrompt(
  input: {
    organizationId: string;
    prompt: string;
    brandId?: string;
  },
  deps: { brandBrainEngine?: IBrandBrainEngine },
): Promise<{
  learned: boolean;
  productBrandUpdated: boolean;
  signals: PromptSignals;
  brandId?: string;
}> {
  const empty: PromptSignals = {
    colors: [],
    toneAdjectives: [],
    voiceNotes: [],
    avoidList: [],
    typography: [],
    styleNotes: [],
  };
  if (!input.organizationId?.trim() || !input.prompt?.trim()) {
    return { learned: false, productBrandUpdated: false, signals: empty };
  }

  const signals = extractPromptSignals(input.prompt);
  if (!hasSignificantSignals(signals)) {
    return { learned: false, productBrandUpdated: false, signals };
  }

  const brandId =
    input.brandId?.trim() || resolveBrandIdFromPrompt(input.prompt) || undefined;

  let productBrandUpdated = false;
  let learned = false;

  try {
    if (brandId) {
      productBrandUpdated = await mergeSignalsIntoProductBrand({
        organizationId: input.organizationId,
        brandId,
        signals,
      });
      learned = productBrandUpdated || learned;
    } else {
      console.warn(
        "[prompt-signal-learner] significant brand signals found but no brandId — product brand not updated",
      );
    }
  } catch (err) {
    console.warn(
      "[prompt-signal-learner] product brand merge failed:",
      err instanceof Error ? err.message : err,
    );
  }

  if (!deps.brandBrainEngine) {
    return { learned, productBrandUpdated, signals, brandId };
  }

  try {
    await deps.brandBrainEngine.ensureHydrated?.(input.organizationId);
    const currentResult = await deps.brandBrainEngine.getCurrent(
      input.organizationId,
    );
    const existing = currentResult.ok ? currentResult.value : undefined;

    const baseDoc: BrandBrainDocument =
      existing?.document ?? emptyBrandBrainDocument(input.organizationId);

    const updatedDoc: BrandBrainDocument = {
      ...baseDoc,
      tone: {
        ...baseDoc.tone,
        adjectives: dedupe(baseDoc.tone.adjectives, [
          ...signals.toneAdjectives,
          ...signals.voiceNotes,
        ]),
        dontList: dedupe(
          baseDoc.tone.dontList,
          signals.avoidList.map((a) => `avoid ${a}`),
        ),
      },
      visual: {
        ...baseDoc.visual,
        colorPalette: dedupe(baseDoc.visual.colorPalette, signals.colors),
        typography: dedupe(baseDoc.visual.typography, signals.typography),
      },
      styleGuideNotes: dedupe(baseDoc.styleGuideNotes, signals.styleNotes),
    };

    const summaryParts: string[] = [];
    if (signals.colors.length) {
      summaryParts.push(`colours: ${signals.colors.slice(0, 3).join(", ")}`);
    }
    if (signals.toneAdjectives.length || signals.voiceNotes.length) {
      summaryParts.push(
        `tone: ${[...signals.toneAdjectives, ...signals.voiceNotes]
          .slice(0, 3)
          .join(", ")}`,
      );
    }
    if (signals.avoidList.length) {
      summaryParts.push(`avoid: ${signals.avoidList.slice(0, 2).join(", ")}`);
    }

    await deps.brandBrainEngine.upsert({
      organizationId: input.organizationId,
      document: updatedDoc,
      changelog: `Learned from prompt: ${summaryParts.join(" | ") || "style signals"}`,
      label: "prompt-signal",
      createdBy: "prompt-signal-learner",
    });
    learned = true;
  } catch {
    // Best-effort brain write
  }

  return { learned, productBrandUpdated, signals, brandId };
}
