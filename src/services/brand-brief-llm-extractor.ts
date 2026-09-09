/**
 * LLM-primary brand fact extraction from free-text briefs (multilingual).
 * Regex is mechanical only: hex colours + merge/normalize. Semantic fields come from LLM.
 * Fallback to English heuristics when LLM is off or unavailable.
 */

import type { IDirectExecutionEngine } from "../platform/direct/contracts";
import {
  asOrganizationId,
  asWorkspaceId,
} from "../platform/core/identifiers";
import { normalizeSchemaForOpenAiStrict } from "../platform/providers/tools/structured/structured-output-execution";
import { applyDirectPassthroughMetadata } from "../platform/api/services/execution-thin-path";
import type { ProductBrandPreferences } from "./brand-preference-writer";
import {
  extractHexColors,
  mergeColorLists,
} from "./brand-color-extraction";
import { extractBrandPreferencesFromPrompt } from "./brand-brief-extractor";

export type EnrichedBrandPreferences = ProductBrandPreferences & {
  extractionSource?: string;
};

const BRAND_EXTRACT_SCHEMA = normalizeSchemaForOpenAiStrict({
  type: "object",
  properties: {
    colors: {
      type: "array",
      items: { type: "string" },
    },
    toneAdjectives: {
      type: "array",
      items: { type: "string" },
    },
    avoidList: {
      type: "array",
      items: { type: "string" },
    },
    typography: {
      type: "array",
      items: { type: "string" },
    },
    styleNotes: {
      type: "array",
      items: { type: "string" },
    },
    industry: { type: "string" },
    targetAudience: { type: "string" },
    positioning: { type: "string" },
    brandSummary: { type: "string" },
    brandName: { type: "string" },
    photographyStyle: { type: "string" },
    illustrationStyle: { type: "string" },
  },
  required: [
    "colors",
    "toneAdjectives",
    "avoidList",
    "typography",
    "styleNotes",
    "industry",
    "targetAudience",
    "positioning",
    "brandSummary",
    "brandName",
    "photographyStyle",
    "illustrationStyle",
  ],
  additionalProperties: false,
});

const LLM_PROVIDERS = [
  { providerId: "provider.openai", modelId: "gpt-4o-mini" },
  { providerId: "provider.anthropic", modelId: "claude-haiku-4-5" },
  { providerId: "provider.gemini", modelId: "gemini-2.5-flash" },
] as const;

export type BrandLlmExtractRollout = "off" | "auto" | "on";

export function resolveBrandLlmExtractRollout(
  env: NodeJS.ProcessEnv = process.env
): BrandLlmExtractRollout {
  const raw = env.BRAND_EXTRACT_LLM?.trim().toLowerCase();
  if (raw === "off" || raw === "auto" || raw === "on") return raw;
  // Default on: LLM owns semantic brand understanding; regex is mechanical/fallback.
  return "on";
}

function extractStructured(
  runtime: import("../platform/providers/runtime/contracts/provider-execution-response").ProviderExecutionResult | undefined
): Record<string, unknown> | null {
  const output = runtime?.response?.output as Record<string, unknown> | undefined;
  if (!output) return null;
  if (output.structured && typeof output.structured === "object") {
    return output.structured as Record<string, unknown>;
  }
  const text =
    typeof output.content === "string"
      ? output.content
      : typeof output.text === "string"
        ? output.text
        : "";
  const match = text.trim().match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter((v) => v.length >= 1 && v.length <= 80)
    .slice(0, 20);
}

function toOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const t = value.trim();
  return t.length >= 2 && t.length <= 400 ? t : undefined;
}

function mapLlmToPreferences(
  parsed: Record<string, unknown>
): ProductBrandPreferences {
  const out: ProductBrandPreferences = {};
  const colors = toStringArray(parsed.colors);
  if (colors.length) out.colors = colors;
  const tone = toStringArray(parsed.toneAdjectives);
  if (tone.length) out.toneAdjectives = tone;
  const avoid = toStringArray(parsed.avoidList);
  if (avoid.length) out.avoidList = avoid;
  const typography = toStringArray(parsed.typography);
  if (typography.length) out.typography = typography;
  const styleNotes = toStringArray(parsed.styleNotes);
  if (styleNotes.length) out.styleNotes = styleNotes;
  const industry = toOptionalString(parsed.industry);
  if (industry) out.industry = industry;
  const audience = toOptionalString(parsed.targetAudience);
  if (audience) out.targetAudience = audience;
  const positioning = toOptionalString(parsed.positioning);
  if (positioning) out.positioning = positioning;
  const summary = toOptionalString(parsed.brandSummary);
  if (summary) out.brandSummary = summary;
  const brandName = toOptionalString(parsed.brandName);
  if (brandName) out.brandName = brandName;
  const photo = toOptionalString(parsed.photographyStyle);
  if (photo) out.photographyStyle = photo;
  const illustration = toOptionalString(parsed.illustrationStyle);
  if (illustration) out.illustrationStyle = illustration;
  return out;
}

function prefsHaveSemanticFacts(prefs: ProductBrandPreferences): boolean {
  return Object.entries(prefs).some(([key, v]) => {
    if (key === "colors") return false; // hex-only does not count as semantic success alone
    return Array.isArray(v) ? v.length > 0 : typeof v === "string" && v.trim().length > 0;
  });
}

function shouldRunLlm(input: {
  readonly prompt: string;
  readonly rollout: BrandLlmExtractRollout;
}): boolean {
  if (input.rollout === "off") return false;
  return input.prompt.trim().length >= 8;
}

/** Mechanical: hex codes only — no language understanding. */
export function extractMechanicalBrandColors(
  prompt: string
): readonly string[] {
  return extractHexColors(prompt);
}

export async function extractBrandPreferencesWithLlm(input: {
  readonly integration: IDirectExecutionEngine;
  readonly organizationId: string;
  readonly prompt: string;
  readonly createId?: (prefix: string) => string;
  readonly rollout?: BrandLlmExtractRollout;
}): Promise<ProductBrandPreferences> {
  const prompt = input.prompt.trim();
  if (!prompt) return {};

  const rollout = input.rollout ?? resolveBrandLlmExtractRollout();
  if (!shouldRunLlm({ prompt, rollout })) {
    return {};
  }

  const id = input.createId ?? ((p: string) => `${p}_${Date.now()}`);
  const llmPrompt = [
    "Extract brand facts from the user brief below.",
    "The brief may be in any language (English, Hindi, Spanish, Hinglish, Arabic, etc.) or mixed languages.",
    "Interpret meaning — do not require English keywords.",
    "Return JSON only.",
    "",
    "Rules for colors:",
    "- List every explicit brand colour mentioned (names or hex).",
    "- Normalize colour names to simple English tokens (red, navy, gold) or hex (#RRGGBB).",
    "- Include colours even when phrased informally or in non-English (e.g. laal, लाल, rojo).",
    "- If no colours are stated but a brand name + category/product is clear, infer 2–4 fitting palette tokens (names or hex) from the brand personality — mark them as inferred in brandSummary if needed.",
    "- If nothing can be inferred, return an empty colors array.",
    "",
    "Rules for other fields:",
    "- brandName: extract the product/company/brand name if present, else empty string.",
    "- toneAdjectives: brand tone/personality words if present, else [].",
    "- avoidList: words/themes to avoid if stated, else [].",
    "- typography / styleNotes: if stated, else [].",
    "- industry, targetAudience, positioning, brandSummary, photographyStyle, illustrationStyle: extract if stated, else empty string.",
    "- Do not invent unrelated brand names.",
    "",
    `Brief:\n${prompt.slice(0, 4000)}`,
  ].join("\n");

  for (const provider of LLM_PROVIDERS) {
    const requestId = id("brand_extract");
    try {
      const result = await input.integration.run({
        requestId,
        rawPrompt: llmPrompt,
        organizationId: asOrganizationId(input.organizationId),
        workspaceId: asWorkspaceId("ws_default"),
        correlationId: requestId,
        mode: "direct_provider" as never,
        metadata: applyDirectPassthroughMetadata({
          skipOutputRequirements: true,
          productAction: "brand_brief_extract",
          preferredProviderId: provider.providerId,
          preferredModelId: provider.modelId,
          providerId: provider.providerId,
          modelId: provider.modelId,
          capabilityId: "text.generate",
          structuredOutput: {
            name: "brand_brief_facts",
            schema: BRAND_EXTRACT_SCHEMA,
            strict: true,
          },
        }),
      });

      if (!result.ok || result.value.success === false) continue;

      const parsed = extractStructured(result.value.artifacts.runtime);
      if (!parsed) continue;

      const mapped = mapLlmToPreferences(parsed);
      const hasAny = Object.values(mapped).some((v) =>
        Array.isArray(v) ? v.length > 0 : typeof v === "string" && v.trim()
      );
      if (hasAny) return mapped;
    } catch {
      continue;
    }
  }

  return {};
}

/**
 * LLM-primary brand understanding; hex regex always merged; English heuristic only if LLM empty.
 */
export async function enrichBrandPreferencesFromBrief(input: {
  readonly prompt: string;
  readonly prompts?: readonly string[];
  readonly integration?: IDirectExecutionEngine;
  readonly organizationId?: string;
  readonly createId?: (prefix: string) => string;
  readonly rollout?: BrandLlmExtractRollout;
}): Promise<EnrichedBrandPreferences> {
  const parts = [
    ...(input.prompts ?? []).map((p) => p.trim()).filter(Boolean),
    ...(input.prompt.trim() ? [input.prompt.trim()] : []),
  ];
  const mergedText = parts.join("\n");
  if (!mergedText) return { extractionSource: "none" };

  const hexColors = extractMechanicalBrandColors(mergedText);

  let llmPrefs: ProductBrandPreferences = {};
  if (input.integration && input.organizationId?.trim()) {
    llmPrefs = await extractBrandPreferencesWithLlm({
      integration: input.integration,
      organizationId: input.organizationId.trim(),
      prompt: mergedText,
      createId: input.createId,
      rollout: input.rollout,
    });
  }

  const usedLlm = Object.values(llmPrefs).some((v) =>
    Array.isArray(v) ? v.length > 0 : typeof v === "string" && v.trim()
  );

  // Heuristic fallback only when LLM produced nothing (offline / off / failure).
  const heuristicPrefs =
    !usedLlm
      ? parts.length > 1
        ? parts.reduce(
            (acc, p) => {
              const row = extractBrandPreferencesFromPrompt(p);
              return {
                ...acc,
                colors: mergeColorLists(acc.colors, row.colors),
                toneAdjectives: [
                  ...new Set([
                    ...(acc.toneAdjectives ?? []),
                    ...(row.toneAdjectives ?? []),
                  ]),
                ],
                industry: acc.industry ?? row.industry,
                targetAudience: acc.targetAudience ?? row.targetAudience,
                positioning: acc.positioning ?? row.positioning,
                brandSummary: acc.brandSummary ?? row.brandSummary,
                avoidList: [
                  ...new Set([...(acc.avoidList ?? []), ...(row.avoidList ?? [])]),
                ],
                typography: [
                  ...new Set([...(acc.typography ?? []), ...(row.typography ?? [])]),
                ],
                styleNotes: [
                  ...new Set([...(acc.styleNotes ?? []), ...(row.styleNotes ?? [])]),
                ],
              };
            },
            {} as ProductBrandPreferences
          )
        : extractBrandPreferencesFromPrompt(mergedText)
      : {};

  const base = usedLlm ? llmPrefs : heuristicPrefs;
  const colors = mergeColorLists(hexColors, base.colors);

  const out: EnrichedBrandPreferences = {
    ...base,
    ...(colors.length ? { colors } : {}),
  };

  if (usedLlm) {
    out.extractionSource = hexColors.length ? "llm+hex" : "llm";
  } else if (prefsHaveSemanticFacts(out) || (out.colors?.length ?? 0) > 0) {
    out.extractionSource = "heuristic_fallback";
  } else {
    out.extractionSource = "none";
  }

  return out;
}
