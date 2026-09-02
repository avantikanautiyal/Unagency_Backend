/**
 * LLM fallback for brand fact extraction when regex misses multilingual / informal phrasing.
 * Best-effort — never throws; returns {} on failure.
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
  briefLikelyMentionsColors,
  extractBriefColors,
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
    industry: { type: "string" },
    targetAudience: { type: "string" },
    positioning: { type: "string" },
    brandSummary: { type: "string" },
  },
  required: ["colors", "toneAdjectives", "industry", "targetAudience", "positioning", "brandSummary"],
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
  return "auto";
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
  return value.map(String).map((s) => s.trim()).filter(Boolean).slice(0, 10);
}

function toOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const t = value.trim();
  return t.length >= 2 ? t.slice(0, 220) : undefined;
}

function mapLlmToPreferences(parsed: Record<string, unknown>): ProductBrandPreferences {
  const out: {
    colors?: string[];
    toneAdjectives?: string[];
    industry?: string;
    targetAudience?: string;
    positioning?: string;
    brandSummary?: string;
  } = {};
  const colors = toStringArray(parsed.colors);
  if (colors.length) out.colors = colors;
  const tone = toStringArray(parsed.toneAdjectives);
  if (tone.length) out.toneAdjectives = tone;
  const industry = toOptionalString(parsed.industry);
  if (industry) out.industry = industry;
  const audience = toOptionalString(parsed.targetAudience);
  if (audience) out.targetAudience = audience;
  const positioning = toOptionalString(parsed.positioning);
  if (positioning) out.positioning = positioning;
  const summary = toOptionalString(parsed.brandSummary);
  if (summary) out.brandSummary = summary;
  return out;
}

function shouldRunLlm(input: {
  readonly prompt: string;
  readonly rollout: BrandLlmExtractRollout;
  readonly regexPrefs: ProductBrandPreferences;
}): boolean {
  if (input.rollout === "off") return false;
  if (input.rollout === "on") return input.prompt.trim().length >= 8;
  const regexColors = extractBriefColors(input.prompt);
  if (regexColors.length > 0) return false;
  if ((input.regexPrefs.colors?.length ?? 0) > 0) return false;
  return briefLikelyMentionsColors(input.prompt);
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
  const regexPrefs = extractBrandPreferencesFromPrompt(prompt);
  if (!shouldRunLlm({ prompt, rollout, regexPrefs })) {
    return {};
  }

  const id = input.createId ?? ((p: string) => `${p}_${Date.now()}`);
  const llmPrompt = [
    "Extract brand facts from the user brief below.",
    "The brief may be in any language (English, Hindi, Spanish, Hinglish, etc.).",
    "Return JSON only.",
    "",
    "Rules for colors:",
    "- List every explicit brand colour mentioned (names or hex).",
    "- Normalize colour names to simple English tokens (red, navy, gold) or hex (#RRGGBB).",
    "- Include colours even when phrased informally or in non-English.",
    "- If no colours are mentioned, return an empty colors array.",
    "",
    "Rules for other fields:",
    "- toneAdjectives: brand tone/personality words if present, else [].",
    "- industry, targetAudience, positioning, brandSummary: extract if stated, else empty string.",
    "- Do not invent facts not supported by the brief.",
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

/** Regex first, optional LLM merge — used by create prepass and learn paths. */
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
  const regexPrefs =
    parts.length > 1
      ? parts.reduce(
          (acc, p) => {
            const row = extractBrandPreferencesFromPrompt(p);
            return {
              ...acc,
              colors: mergeColorLists(acc.colors, row.colors),
              toneAdjectives: [
                ...new Set([...(acc.toneAdjectives ?? []), ...(row.toneAdjectives ?? [])]),
              ],
              industry: acc.industry ?? row.industry,
              targetAudience: acc.targetAudience ?? row.targetAudience,
              positioning: acc.positioning ?? row.positioning,
              brandSummary: acc.brandSummary ?? row.brandSummary,
            };
          },
          {} as ProductBrandPreferences
        )
      : extractBrandPreferencesFromPrompt(mergedText);

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

  const colors = mergeColorLists(regexPrefs.colors, llmPrefs.colors);
  const toneAdjectives = [
    ...new Set([
      ...(regexPrefs.toneAdjectives ?? []),
      ...(llmPrefs.toneAdjectives ?? []),
    ]),
  ];

  const out: EnrichedBrandPreferences = {
    ...regexPrefs,
    ...(colors.length ? { colors } : {}),
    ...(toneAdjectives.length ? { toneAdjectives } : {}),
    industry: regexPrefs.industry ?? llmPrefs.industry,
    targetAudience: regexPrefs.targetAudience ?? llmPrefs.targetAudience,
    positioning: regexPrefs.positioning ?? llmPrefs.positioning,
    brandSummary: regexPrefs.brandSummary ?? llmPrefs.brandSummary,
  };

  const usedLlm = Object.values(llmPrefs).some((v) =>
    Array.isArray(v) ? v.length > 0 : typeof v === "string" && v.trim()
  );
  out.extractionSource = usedLlm
    ? colors.length && (regexPrefs.colors?.length ?? 0) > 0
      ? "regex+llm"
      : "llm"
    : "regex";

  return out;
}
