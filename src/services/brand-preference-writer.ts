/**
 * Merge learned preference signals into the product Brand Mongo document.
 * Best-effort: never throws; never blocks create/refine/save callers.
 */

import mongoose from "mongoose";
import Brands from "../models/brand.model";

export type ProductBrandPreferences = {
  readonly colors?: readonly string[];
  readonly toneAdjectives?: readonly string[];
  readonly voiceNotes?: readonly string[];
  readonly avoidList?: readonly string[];
  readonly typography?: readonly string[];
  readonly styleNotes?: readonly string[];
  readonly preferredFormats?: readonly string[];
  readonly industry?: string;
  readonly targetAudience?: string;
  readonly positioning?: string;
  readonly photographyStyle?: string;
  readonly illustrationStyle?: string;
  readonly brandSummary?: string;
};

function dedupe(arr: readonly string[], additions: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of [...arr, ...additions]) {
    const key = item.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item.trim());
  }
  return out;
}

function looksLikeColorToken(value: string): boolean {
  const v = value.trim();
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v)) return true;
  return /^(red|blue|green|yellow|orange|purple|violet|pink|black|white|grey|gray|brown|beige|cream|ivory|gold|silver|teal|navy|coral|peach|mint|olive|charcoal|maroon|turquoise|lavender|terracotta|saffron|ochre|rust)$/i.test(
    v
  );
}

export async function resolveProductBrandId(input: {
  organizationId: string;
  brandId?: string;
}): Promise<string | undefined> {
  if (!mongoose.isValidObjectId(input.organizationId)) return undefined;
  if (input.brandId && mongoose.isValidObjectId(input.brandId)) {
    const exists = await Brands.exists({
      _id: new mongoose.Types.ObjectId(input.brandId),
      organizationId: new mongoose.Types.ObjectId(input.organizationId),
      status: { $ne: "archived" },
    });
    if (exists) return input.brandId;
  }

  const latest = await Brands.findOne({
    organizationId: new mongoose.Types.ObjectId(input.organizationId),
    status: { $ne: "archived" },
  })
    .sort({ updatedAt: -1 })
    .select("_id")
    .lean();
  return latest?._id ? String(latest._id) : undefined;
}

export async function mergePreferencesIntoProductBrand(input: {
  organizationId: string;
  brandId?: string;
  preferences: ProductBrandPreferences;
  source?: string;
}): Promise<{ updated: boolean; brandId?: string; reason?: string }> {
  try {
    const prefs = input.preferences;
    const hasAny = Object.values(prefs).some((v) =>
      Array.isArray(v) ? v.length > 0 : typeof v === "string" && v.trim()
    );
    if (!hasAny) return { updated: false, reason: "empty_preferences" };

    const brandId = await resolveProductBrandId({
      organizationId: input.organizationId,
      brandId: input.brandId,
    });
    if (!brandId) {
      return { updated: false, reason: "no_brand" };
    }

    const doc = await Brands.findOne({
      _id: new mongoose.Types.ObjectId(brandId),
      organizationId: new mongoose.Types.ObjectId(input.organizationId),
      status: { $ne: "archived" },
    });
    if (!doc) return { updated: false, brandId, reason: "brand_not_found" };

    const gp = {
      ...((doc.guidelinesProfile ?? {}) as Record<string, unknown>),
    };
    let changed = false;

    const colorTokens = (prefs.colors ?? []).filter(looksLikeColorToken);
    const colorNotes = (prefs.colors ?? []).filter((c) => !looksLikeColorToken(c));

    if (colorTokens.length) {
      const nextColors = dedupe(doc.colors ?? [], colorTokens);
      if (nextColors.join("|") !== (doc.colors ?? []).join("|")) {
        doc.colors = nextColors;
        changed = true;
      }
      const primary = dedupe(
        Array.isArray(gp.primaryColors) ? (gp.primaryColors as string[]) : [],
        colorTokens
      );
      if (
        primary.join("|") !==
        (Array.isArray(gp.primaryColors)
          ? (gp.primaryColors as string[]).join("|")
          : "")
      ) {
        gp.primaryColors = primary;
        changed = true;
      }
    }

    if (prefs.toneAdjectives?.length || prefs.voiceNotes?.length) {
      const toneParts = [
        typeof gp.tone === "string" ? gp.tone : "",
        ...(prefs.toneAdjectives ?? []),
        ...(prefs.voiceNotes ?? []),
      ]
        .map((s) => s.trim())
        .filter(Boolean);
      const tone = [...new Set(toneParts)].join(", ");
      if (tone && tone !== gp.tone) {
        gp.tone = tone;
        changed = true;
      }
      // Do not overwrite brands.voice — mobile stores Stage · Team Size · Age there.
      if (prefs.toneAdjectives?.length) {
        const existingKeywords = Array.isArray(gp.personalityKeywords)
          ? (gp.personalityKeywords as unknown[]).map(String)
          : typeof gp.brandPersonality === "string"
            ? gp.brandPersonality.split(/,\s*/)
            : [];
        const personalityKeywords = dedupe(existingKeywords, prefs.toneAdjectives);
        const personality = personalityKeywords.join(", ");
        if (
          personality &&
          (personality !== gp.brandPersonality ||
            JSON.stringify(personalityKeywords) !==
              JSON.stringify(gp.personalityKeywords ?? []))
        ) {
          gp.brandPersonality = personality;
          gp.personalityKeywords = personalityKeywords;
          changed = true;
        }
      }
    }

    if (prefs.avoidList?.length) {
      const words = dedupe(
        Array.isArray(gp.wordsToAvoid) ? (gp.wordsToAvoid as string[]) : [],
        prefs.avoidList
      );
      if (
        words.join("|") !==
        (Array.isArray(gp.wordsToAvoid)
          ? (gp.wordsToAvoid as string[]).join("|")
          : "")
      ) {
        gp.wordsToAvoid = words;
        changed = true;
      }
    }

    if (prefs.typography?.length) {
      const typography = dedupe(
        typeof gp.typography === "string" ? gp.typography.split(/,\s*/) : [],
        prefs.typography
      ).join(", ");
      if (typography && typography !== gp.typography) {
        gp.typography = typography;
        changed = true;
      }
    }

    const styleNotes = [
      ...(prefs.styleNotes ?? []),
      ...colorNotes.map((n) => `Colour preference: ${n}`),
      ...(prefs.preferredFormats ?? []).map((f) => `Preferred format: ${f}`),
    ];
    if (styleNotes.length) {
      const noteBlock = styleNotes.slice(0, 4).join(" | ");
      const existing =
        typeof gp.voiceGuidelines === "string" ? gp.voiceGuidelines : "";
      if (noteBlock && !existing.includes(noteBlock.slice(0, 40))) {
        gp.voiceGuidelines = existing ? `${existing}\n${noteBlock}` : noteBlock;
        changed = true;
      }
    }

    if (prefs.industry?.trim() && !(doc.industry ?? "").trim()) {
      doc.industry = prefs.industry.trim();
      changed = true;
    }

    if (prefs.targetAudience?.trim()) {
      if (!(doc.targetAudience ?? "").trim()) {
        doc.targetAudience = prefs.targetAudience.trim();
        changed = true;
      }
      if (!(typeof gp.targetAudience === "string" ? gp.targetAudience : "").trim()) {
        gp.targetAudience = prefs.targetAudience.trim();
        changed = true;
      }
    }

    if (prefs.positioning?.trim() && !(doc.positioning ?? "").trim()) {
      doc.positioning = prefs.positioning.trim();
      changed = true;
    }

    if (prefs.photographyStyle?.trim() && !(gp.photographyStyle ?? "").trim()) {
      gp.photographyStyle = prefs.photographyStyle.trim();
      changed = true;
    }

    if (prefs.illustrationStyle?.trim() && !(gp.illustrationStyle ?? "").trim()) {
      gp.illustrationStyle = prefs.illustrationStyle.trim();
      changed = true;
    }

    if (prefs.brandSummary?.trim()) {
      const next = prefs.brandSummary.trim();
      const existing =
        typeof gp.brandSummary === "string" ? gp.brandSummary.trim() : "";
      if (!existing || next.length > existing.length) {
        gp.brandSummary = next;
        changed = true;
      }
      if (!(doc.positioning ?? "").trim() && next.length >= 20) {
        doc.positioning = next.slice(0, 220);
        changed = true;
      }
    }

    if (!changed) return { updated: false, brandId, reason: "no_change" };

    doc.guidelinesProfile = gp;
    doc.markModified("guidelinesProfile");
    await doc.save();

    console.log(
      `[brand] preference merge | source=${input.source ?? "unknown"} | brandId=${brandId}`
    );
    return { updated: true, brandId };
  } catch (err) {
    console.warn(
      `[brand] preference merge failed | ${err instanceof Error ? err.message : String(err)}`
    );
    return { updated: false, reason: "write_failed" };
  }
}
