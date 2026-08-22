/**
 * Dual-write helper — persist Brand Brain–style preference signals into the
 * product Brand Mongo SoT so Brand Intelligence (which reads product brands)
 * compounds on the next create.
 *
 * Best-effort: never throws to callers; never blocks create/refine/save.
 */

import mongoose from "mongoose";
import Brands from "../../../../models/brand.model";
import { toBrandDto } from "../../../../services/brand-service";
import { syncProductBrandToBrain } from "../../../../services/brand-brain-sync-service";

export type ProductBrandPreferences = {
  readonly colors?: readonly string[];
  readonly toneAdjectives?: readonly string[];
  readonly voiceNotes?: readonly string[];
  readonly avoidList?: readonly string[];
  readonly typography?: readonly string[];
  readonly styleNotes?: readonly string[];
  readonly preferredFormats?: readonly string[];
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

/** Hex or short named colour tokens that belong in `colors[]`. */
function looksLikeColorToken(value: string): boolean {
  const v = value.trim();
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v)) return true;
  return /^(red|blue|green|yellow|orange|purple|violet|pink|black|white|grey|gray|brown|beige|cream|ivory|gold|silver|teal|navy|coral|peach|mint|olive|charcoal|maroon|turquoise|lavender|terracotta|saffron|ochre|rust)$/i.test(
    v
  );
}

/**
 * Resolve which product brand to update.
 * Prefer explicit brandId; else most recently updated active brand in the org.
 */
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

/**
 * Merge preference signals into product brand guidelines/colors/voice.
 * Returns whether the product brand document was updated.
 */
export async function mergePreferencesIntoProductBrand(input: {
  organizationId: string;
  brandId?: string;
  preferences: ProductBrandPreferences;
  source?: string;
}): Promise<{ updated: boolean; brandId?: string; reason?: string }> {
  try {
    const prefs = input.preferences;
    const hasAny = Object.values(prefs).some(
      (v) => Array.isArray(v) && v.length > 0
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
      if (tone && tone !== (doc.voice ?? "").trim()) {
        doc.voice = tone;
        changed = true;
      }
      if (prefs.toneAdjectives?.length) {
        const personality = dedupe(
          typeof gp.brandPersonality === "string"
            ? gp.brandPersonality.split(/,\s*/)
            : [],
          prefs.toneAdjectives
        ).join(", ");
        if (personality && personality !== gp.brandPersonality) {
          gp.brandPersonality = personality;
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

    if (!changed) return { updated: false, brandId, reason: "no_change" };

    doc.guidelinesProfile = gp;
    doc.markModified("guidelinesProfile");
    await doc.save();

    try {
      await syncProductBrandToBrain(toBrandDto(doc));
    } catch {
      // brain sync is best-effort
    }

    console.log(
      `🧠 [AI OS] brand preference dual-write | source=${input.source ?? "unknown"} | brandId=${brandId} | colours=${colorTokens.slice(0, 4).join(",") || "—"} | tone=${(prefs.toneAdjectives ?? []).slice(0, 3).join(",") || "—"}`
    );
    return { updated: true, brandId };
  } catch (err) {
    console.warn(
      `🧠 [AI OS] brand preference dual-write failed | ${err instanceof Error ? err.message : String(err)}`
    );
    return { updated: false, reason: "write_failed" };
  }
}
