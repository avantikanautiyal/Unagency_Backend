/**
 * Extract durable brand facts from free-text prompts — server mirror of FE extractor.
 */

import type { ProductBrandPreferences } from "./brand-preference-writer";
import { extractBriefColors } from "./brand-color-extraction";

export { extractBriefColors, briefSpecifiesColorPalette } from "./brand-color-extraction";

const TONE_WORDS = [
  "professional", "playful", "bold", "minimal", "minimalist", "luxury",
  "friendly", "warm", "corporate", "casual", "elegant", "modern", "classic",
  "edgy", "premium", "approachable", "authoritative", "youthful",
  "sophisticated", "energetic", "calm", "confident", "witty", "serious",
  "inspirational",
];

function capture(label: RegExp, text: string): string | undefined {
  const match = text.match(label);
  const value = match?.[1]?.trim();
  return value && value.length >= 2 && value.length <= 200 ? value : undefined;
}

function listAfter(label: RegExp, text: string): string[] {
  const match = text.match(label);
  if (!match?.[1]) return [];
  return match[1]
    .split(/[,;|/]/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2 && s.length <= 80);
}

function extractBrandSummary(text: string): string | undefined {
  const labeled = capture(
    /\b(?:about (?:the )?brand|brand story|who we are|what we are|brand is about)\s*:?\s*([^.!?\n]{15,220})/i,
    text
  );
  if (labeled) return labeled;

  const isA = text.match(
    /\b([A-Z][A-Za-z0-9''\u00C0-\u024F-]{1,48})\s+is\s+(?:a|an)\s+([^.!?\n]{15,180})/
  );
  if (isA?.[1] && isA[2]) {
    return `${isA[1]} is ${isA[2].trim()}`.slice(0, 220);
  }

  for (const sentence of text.split(/[.!?]+/)) {
    const s = sentence.trim();
    if (s.length < 40 || s.length > 220) continue;
    if (/\b(generate|create|give me|make a|based on the above|retry)\b/i.test(s)) {
      continue;
    }
    if (
      /\b(brand|audience|cultural|heritage|authentic|premium|positioned|theme|cuisine|restaurant|fashion|coffee|italian|indian|luxury)\b/i.test(
        s
      )
    ) {
      return s.slice(0, 220);
    }
  }
  return undefined;
}

export function extractBrandPreferencesFromPrompt(
  prompt: string | null | undefined
): ProductBrandPreferences & {
  industry?: string;
  targetAudience?: string;
  positioning?: string;
  photographyStyle?: string;
  illustrationStyle?: string;
  brandSummary?: string;
} {
  const text = (prompt ?? "").trim();
  if (!text) return {};

  const colors = extractBriefColors(text);
  const toneAdjectives = (() => {
    const explicit = listAfter(
      /\b(?:brand\s+)?(?:tone|voice|personality)\s*(?:is|are|:|=|-)\s*([^.!?\n]{2,120})/i,
      text
    );
    const found = new Set<string>(explicit.map((s) => s.toLowerCase()));
    const lower = text.toLowerCase();
    for (const word of TONE_WORDS) {
      if (new RegExp(`\\b${word}\\b`, "i").test(lower)) found.add(word);
    }
    return [...found].slice(0, 8);
  })();

  const avoidList = listAfter(
    /\b(?:avoid|never\s+use|don'?t\s+use|words?\s+to\s+avoid)\s*(?:words?|terms?|phrases?)?\s*(?:like|:|-|=)\s*([^.!?\n]{2,160})/i,
    text
  ).slice(0, 12);

  const typography: string[] = [];
  const explicitTypo = capture(
    /\b(?:typography|typeface|font(?:\s+family)?)\s*(?:is|:|=|-)\s*([^.!?\n]{2,80})/i,
    text
  );
  if (explicitTypo) typography.push(explicitTypo);
  for (const m of text.matchAll(
    /\b(Helvetica(?:\s+Neue)?|Inter|Roboto|Montserrat|Poppins|Arial|Georgia|Garamond|Futura|Avenir|SF\s+Pro|Open\s+Sans|Lato|Playfair(?:\s+Display)?)\b/gi
  )) {
    if (m[1]) typography.push(m[1].trim());
  }

  const styleNotes: string[] = [];
  const aesthetic = capture(
    /\b(?:aesthetic|visual\s+style|look\s+and\s+feel)\s*(?:is|:|=|-)\s*([^.!?\n]{2,120})/i,
    text
  );
  if (aesthetic) styleNotes.push(aesthetic);

  const out: ProductBrandPreferences & {
    industry?: string;
    targetAudience?: string;
    positioning?: string;
    photographyStyle?: string;
    illustrationStyle?: string;
  } = {};

  if (colors.length) out.colors = colors;
  if (toneAdjectives.length) out.toneAdjectives = toneAdjectives;
  if (avoidList.length) out.avoidList = avoidList;
  if (typography.length) {
    out.typography = [...new Set(typography.map((s) => s.trim()).filter(Boolean))].slice(0, 6);
  }
  if (styleNotes.length) out.styleNotes = styleNotes;

  const industry = capture(
    /\b(?:industry|sector|vertical)\s*(?:is|:|=|-)\s*([^.!?\n]{2,80})/i,
    text
  );
  const targetAudience = capture(
    /\b(?:target\s+audience|audience|customers?|for\s+who)\s*(?:is|are|:|=|-)\s*([^.!?\n]{2,120})/i,
    text
  );
  const positioning = capture(
    /\b(?:positioning|brand\s+position(?:ing)?)\s*(?:is|:|=|-)\s*([^.!?\n]{2,160})/i,
    text
  );
  const photographyStyle = capture(
    /\b(?:photography(?:\s+style)?|photo\s+style)\s*(?:is|:|=|-)\s*([^.!?\n]{2,120})/i,
    text
  );
  const illustrationStyle = capture(
    /\b(?:illustration(?:\s+style)?|illustrations?)\s*(?:is|are|:|=|-)\s*([^.!?\n]{2,120})/i,
    text
  );

  if (industry) out.industry = industry;
  if (targetAudience) out.targetAudience = targetAudience;
  if (positioning) out.positioning = positioning;
  if (photographyStyle) out.photographyStyle = photographyStyle;
  if (illustrationStyle) out.illustrationStyle = illustrationStyle;

  const brandSummary = extractBrandSummary(text);
  if (brandSummary) out.brandSummary = brandSummary;

  return out;
}

export function mergeBrandPreferencesFromPrompts(
  prompts: readonly string[]
): ReturnType<typeof extractBrandPreferencesFromPrompt> {
  const merged: ReturnType<typeof extractBrandPreferencesFromPrompt> = {};
  for (const prompt of prompts) {
    const prefs = extractBrandPreferencesFromPrompt(prompt);
    const mergeArr = (key: "colors" | "toneAdjectives" | "avoidList" | "typography" | "styleNotes") => {
      const values = prefs[key];
      if (!values?.length) return;
      merged[key] = [...new Set([...(merged[key] ?? []), ...values])];
    };
    mergeArr("colors");
    mergeArr("toneAdjectives");
    mergeArr("avoidList");
    mergeArr("typography");
    mergeArr("styleNotes");
    if (prefs.industry && !merged.industry) merged.industry = prefs.industry;
    if (prefs.targetAudience && !merged.targetAudience) {
      merged.targetAudience = prefs.targetAudience;
    }
    if (prefs.positioning && !merged.positioning) merged.positioning = prefs.positioning;
    if (prefs.photographyStyle && !merged.photographyStyle) {
      merged.photographyStyle = prefs.photographyStyle;
    }
    if (prefs.illustrationStyle && !merged.illustrationStyle) {
      merged.illustrationStyle = prefs.illustrationStyle;
    }
    if (prefs.brandSummary && (!merged.brandSummary || prefs.brandSummary.length > merged.brandSummary.length)) {
      merged.brandSummary = prefs.brandSummary;
    }
  }
  return merged;
}
