/**
 * Brand Learning — Phase 1: Refinement Signal Learner
 *
 * When a user completes a refinement MCQ (or writes a custom note), the
 * structured answers tell us exactly what they wanted changed and what they
 * wanted preserved.  This module translates those signals into diffs on the
 * BrandBrainDocument and persists a new version via BrandBrainEngine.upsert().
 *
 * Signal → BrandBrain mapping:
 *  tone.*          → tone.adjectives / tone.doList / tone.dontList
 *  symbol.*        → visual.imageryNotes (logo direction)
 *  typeface.*      → visual.typography
 *  color_palette.* → visual.colorPalette
 *  preserve.*      → contentPreferences (locked elements)
 *  *.other_text    → styleGuideNotes (verbatim user instruction)
 *  dissatisfaction.* → tone.dontList / styleGuideNotes
 */

import type { FeedbackAnswer } from "../../os/refinement/contracts/feedback-session";
import type { RefinementSpecification } from "../../os/refinement/contracts/refinement-specification";
import type { IBrandBrainEngine } from "../interfaces";
import type {
  BrandBrainDocument,
  ToneKnowledge,
  VisualGuidelinesKnowledge,
  ContentPreferencesKnowledge,
} from "../contracts/knowledge";
import { mergePreferencesIntoProductBrand } from "./product-brand-preference-writer";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dedupe(arr: readonly string[], additions: string[]): readonly string[] {
  const set = new Set([...arr, ...additions.map((s) => s.trim()).filter(Boolean)]);
  return [...set];
}

function without(arr: readonly string[], removals: string[]): readonly string[] {
  const rm = new Set(removals.map((s) => s.toLowerCase().trim()));
  return arr.filter((s) => !rm.has(s.toLowerCase().trim()));
}

// ---------------------------------------------------------------------------
// Signal → diff helpers
// ---------------------------------------------------------------------------

interface BrandDiff {
  toneAdjectives: string[];
  toneDo: string[];
  toneDont: string[];
  colorPalette: string[];
  typography: string[];
  imageryNotes: string[];
  styleGuideNotes: string[];
  prohibitedFormats: string[];
  preferredFormats: string[];
}

const EMPTY_DIFF = (): BrandDiff => ({
  toneAdjectives: [],
  toneDo: [],
  toneDont: [],
  colorPalette: [],
  typography: [],
  imageryNotes: [],
  styleGuideNotes: [],
  prohibitedFormats: [],
  preferredFormats: [],
});

/**
 * Map a single refinement signal string + dimension to brand diff fields.
 * Returns partial diff entries — caller accumulates them.
 */
function signalToDiff(
  signal: string,
  dimension: string,
  value: string,
  otherText?: string
): Partial<BrandDiff> {
  // ---------- tone ----------
  if (dimension === "tone") {
    if (value === "premium") return { toneAdjectives: ["premium"], toneDo: ["maintain a premium tone"] };
    if (value === "friendly") return { toneAdjectives: ["friendly", "approachable"], toneDo: ["keep the tone warm and conversational"] };
    if (value === "concise") return { toneAdjectives: ["concise"], toneDo: ["be direct and concise"], toneDont: ["use filler words or padding"] };
    if (value === "bold") return { toneAdjectives: ["bold", "confident"], toneDo: ["use strong, assertive language"] };
    if (otherText) return { toneAdjectives: [], toneDo: [otherText], styleGuideNotes: [`Tone preference: ${otherText}`] };
  }

  // ---------- symbol (logo icon) ----------
  if (dimension === "symbol") {
    if (value === "simpler") return { imageryNotes: ["prefer simpler, cleaner logo symbols"], toneDont: ["use overly complex icons"] };
    if (value === "bolder") return { imageryNotes: ["logo icon should be bold and strong"] };
    if (value === "abstract") return { imageryNotes: ["prefer abstract logo mark over literal imagery"] };
    if (value === "literal") return { imageryNotes: ["prefer recognisable, literal logo mark"] };
    if (value === "modern") return { imageryNotes: ["logo direction: modern aesthetic"] };
    if (value === "traditional") return { imageryNotes: ["logo direction: traditional / classic aesthetic"] };
    if (otherText) return { imageryNotes: [`Logo symbol note: ${otherText}`], styleGuideNotes: [`Logo: ${otherText}`] };
  }

  // ---------- typeface ----------
  if (dimension === "typeface") {
    if (value === "bolder") return { typography: ["prefer bold-weight typeface"] };
    if (value === "lighter") return { typography: ["prefer lightweight / elegant typeface"] };
    if (value === "serif") return { typography: ["use serif typeface"] };
    if (value === "sans") return { typography: ["use sans-serif typeface"] };
    if (value === "custom") return { typography: ["prefer unique / custom typeface feel"] };
    if (otherText) return { typography: [`Typeface preference: ${otherText}`] };
  }

  // ---------- color palette ----------
  if (dimension === "color_palette") {
    if (value === "vibrant") return { colorPalette: ["vibrant / saturated palette preferred"], styleGuideNotes: ["Prefer vibrant, saturated colours"] };
    if (value === "muted") return { colorPalette: ["muted / subtle palette preferred"], styleGuideNotes: ["Prefer muted, subtle colour tones"] };
    if (value === "dark") return { colorPalette: ["darker tones preferred"] };
    if (value === "light") return { colorPalette: ["lighter / pastel tones preferred"] };
    if (value === "monochrome") return { colorPalette: ["monochrome / single-colour palette"], styleGuideNotes: ["Consider monochrome palette option"] };
    if (otherText) return { colorPalette: [otherText], styleGuideNotes: [`Colour preference: ${otherText}`] };
  }

  // ---------- visual style ----------
  if (dimension === "visual_style") {
    if (value === "minimal") return { imageryNotes: ["prefer minimal visual style"], toneDo: ["keep visuals clean and uncluttered"] };
    if (value === "premium") return { imageryNotes: ["premium visual direction"], toneAdjectives: ["premium"] };
    if (value === "bold") return { imageryNotes: ["bold visual style preferred"] };
    if (value === "playful") return { imageryNotes: ["playful visual style preferred"], toneAdjectives: ["playful"] };
  }

  // ---------- dissatisfaction (what user didn't like → dontList) ----------
  if (dimension === "dissatisfaction") {
    const notes: string[] = [];
    if (otherText) notes.push(`User dissatisfied with: ${otherText}`);
    return { styleGuideNotes: notes };
  }

  // ---------- strategy / depth ----------
  if (dimension === "strategy") {
    if (value === "audience") return { styleGuideNotes: ["Refine audience targeting in strategy"] };
    if (value === "positioning") return { styleGuideNotes: ["Strengthen positioning / differentiation in strategy"] };
    if (value === "channels") return { styleGuideNotes: ["Expand channel / tactics coverage in strategy"] };
    if (value === "messaging") return { styleGuideNotes: ["Improve key messaging in strategy"] };
  }
  if (dimension === "depth") {
    if (value === "executive") return { preferredFormats: ["executive-summary format"] };
    if (value === "tactical") return { preferredFormats: ["tactical action-step format"] };
    if (value === "full") return { preferredFormats: ["full strategy with all sections"] };
  }

  // ---------- free-form other text on any dimension ----------
  if (otherText) {
    return { styleGuideNotes: [`${dimension}: ${otherText}`] };
  }

  // ---------- generic keep signals → preferred ----------
  if (signal.endsWith(".keep") || value === "keep") {
    return { preferredFormats: [`preserve ${dimension}`] };
  }

  return {};
}

/**
 * Translate all MCQ answers + custom notes into a single BrandDiff.
 */
export function answersToSignals(
  answers: readonly FeedbackAnswer[],
  spec: RefinementSpecification,
): BrandDiff {
  const diff = EMPTY_DIFF();

  // Process structured MCQ answers
  for (const answer of answers) {
    for (let i = 0; i < answer.refinementSignals.length; i++) {
      const signal = answer.refinementSignals[i]!;
      const value = answer.values[i] ?? answer.values[0] ?? "";
      const partial = signalToDiff(signal, answer.dimension, value, undefined);
      for (const [k, v] of Object.entries(partial) as [keyof BrandDiff, string[]][]) {
        diff[k].push(...v);
      }
    }
    // Custom free-text note
    if (answer.otherText?.trim()) {
      const partial = signalToDiff(
        `${answer.dimension}.other_text`,
        answer.dimension,
        "other",
        answer.otherText.trim(),
      );
      for (const [k, v] of Object.entries(partial) as [keyof BrandDiff, string[]][]) {
        diff[k].push(...v);
      }
    }
  }

  // Also incorporate spec-level requestedChanges that carry otherText values
  for (const change of spec.requestedChanges) {
    if (change.signal.endsWith(".other_text") && typeof change.value === "string") {
      diff.styleGuideNotes.push(`Refinement note: ${change.value}`);
    }
  }

  return diff;
}

/**
 * Apply a BrandDiff to an existing BrandBrainDocument (immutable merge).
 */
export function applyDiffToDocument(
  doc: BrandBrainDocument,
  diff: BrandDiff,
): BrandBrainDocument {
  const tone: ToneKnowledge = {
    adjectives: dedupe(doc.tone.adjectives, diff.toneAdjectives),
    doList: dedupe(doc.tone.doList, diff.toneDo),
    dontList: dedupe(doc.tone.dontList, diff.toneDont),
    samplePhrases: doc.tone.samplePhrases,
  };

  const visual: VisualGuidelinesKnowledge = {
    colorPalette: dedupe(doc.visual.colorPalette, diff.colorPalette),
    typography: dedupe(doc.visual.typography, diff.typography),
    imageryNotes: dedupe(doc.visual.imageryNotes, diff.imageryNotes),
    logoUsage: doc.visual.logoUsage,
  };

  const contentPreferences: ContentPreferencesKnowledge = {
    preferredFormats: dedupe(doc.contentPreferences.preferredFormats, diff.preferredFormats),
    prohibitedTopics: dedupe(doc.contentPreferences.prohibitedTopics, diff.prohibitedFormats),
    ctaStyles: doc.contentPreferences.ctaStyles,
  };

  const styleGuideNotes = dedupe(doc.styleGuideNotes, diff.styleGuideNotes);

  return {
    ...doc,
    tone,
    visual,
    contentPreferences,
    styleGuideNotes,
  };
}

// ---------------------------------------------------------------------------
// Empty document factory (used when no brain exists yet for an org)
// ---------------------------------------------------------------------------

export function emptyBrandBrainDocument(organizationId: string, brandId?: string): BrandBrainDocument {
  return {
    organizationId,
    brandId,
    organization: {
      legalName: "",
      industry: "",
      regions: [],
      languages: ["en"],
      summary: "",
    },
    identity: {
      brandId: brandId ?? "",
      name: "",
      mission: "",
      vision: "",
      values: [],
      positioning: "",
      differentiators: [],
    },
    products: [],
    services: [],
    audiences: [],
    personas: [],
    competitors: [],
    tone: {
      adjectives: [],
      doList: [],
      dontList: [],
      samplePhrases: [],
    },
    visual: {
      colorPalette: [],
      typography: [],
      imageryNotes: [],
      logoUsage: [],
    },
    campaignHistory: [],
    successfulStrategies: [],
    failedStrategies: [],
    contentPreferences: {
      preferredFormats: [],
      prohibitedTopics: [],
      ctaStyles: [],
    },
    policies: [],
    localization: [],
    seasonality: [],
    goals: [],
    styleGuideNotes: [],
    marketNotes: [],
    assetRefs: [],
  };
}

// ---------------------------------------------------------------------------
// Main learner — call from RefinementEngine after finalization
// ---------------------------------------------------------------------------

export interface RefinementLearnerDeps {
  readonly brandBrainEngine: IBrandBrainEngine;
}

/**
 * Reads current BrandBrain for the org, applies refinement signals, saves new version,
 * and dual-writes into the product Brand SoT so Brand Intelligence can apply them next.
 * Best-effort — never throws; errors are logged and swallowed so they never
 * block the refinement flow.
 */
export async function learnFromRefinement(
  spec: RefinementSpecification,
  answers: readonly FeedbackAnswer[],
  deps: RefinementLearnerDeps,
): Promise<void> {
  if (!spec.organizationId?.trim()) return;
  if (answers.length === 0) return;

  const diff = answersToSignals(answers, spec);

  // Skip if diff is entirely empty (all "keep" signals)
  const hasContent = Object.values(diff).some((arr) => arr.length > 0);
  if (!hasContent) return;

  try {
    await deps.brandBrainEngine.ensureHydrated?.(spec.organizationId);
    const currentResult = await deps.brandBrainEngine.getCurrent(spec.organizationId);
    const existing = currentResult.ok ? currentResult.value : undefined;

    const baseDoc: BrandBrainDocument = existing?.document
      ?? emptyBrandBrainDocument(spec.organizationId);

    const updatedDoc = applyDiffToDocument(baseDoc, diff);

    const summaryParts: string[] = [];
    if (diff.toneAdjectives.length) summaryParts.push(`tone: ${diff.toneAdjectives.join(", ")}`);
    if (diff.colorPalette.length) summaryParts.push(`colours: ${diff.colorPalette.slice(0, 2).join(", ")}`);
    if (diff.typography.length) summaryParts.push(`typeface: ${diff.typography.slice(0, 1).join(", ")}`);
    if (diff.imageryNotes.length) summaryParts.push(`visual: ${diff.imageryNotes.slice(0, 1).join(", ")}`);
    if (diff.styleGuideNotes.length) summaryParts.push(`notes: ${diff.styleGuideNotes.slice(0, 1).join(", ")}`);

    const changelog = `Learned from refinement ${spec.refinementId} (${spec.outputType}): ${summaryParts.join(" | ") || "user feedback applied"}`;

    await deps.brandBrainEngine.upsert({
      organizationId: spec.organizationId,
      document: updatedDoc,
      changelog,
      label: `refinement-${spec.refinementId}`,
      createdBy: "refinement-signal-learner",
    });
  } catch {
    // Best-effort — never block the refinement flow
  }

  // Dual-write into product brand SoT (Brand Intelligence read path).
  void mergePreferencesIntoProductBrand({
    organizationId: spec.organizationId,
    brandId: spec.brandId,
    source: `refinement:${spec.refinementId}`,
    preferences: {
      colors: diff.colorPalette,
      toneAdjectives: diff.toneAdjectives,
      voiceNotes: diff.toneDo,
      avoidList: diff.toneDont,
      typography: diff.typography,
      styleNotes: [
        ...diff.styleGuideNotes,
        ...diff.imageryNotes.map((n) => `Visual: ${n}`),
      ],
      preferredFormats: [
        ...diff.preferredFormats,
        ...diff.prohibitedFormats.map((f) => `avoid:${f}`),
      ],
    },
  });
}
