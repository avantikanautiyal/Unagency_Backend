/**
 * Learn brand knowledge from user prompts — persists to Mongo brand document.
 * Platform-wide: any service / chat turn with brandId can contribute facts.
 * Extraction: LLM-primary via enrichBrandPreferencesFromBrief when integration
 * is available; English/heuristic fallback only when offline (BRAND_EXTRACT_LLM).
 */

import { brandService } from "./brand-service";
import {
  extractBrandPreferencesFromPrompt,
  mergeBrandPreferencesFromPrompts,
} from "./brand-brief-extractor";
import {
  mergePreferencesIntoProductBrand,
  type ProductBrandPreferences,
} from "./brand-preference-writer";
import type { IDirectExecutionEngine } from "../platform/direct/contracts";
import {
  enrichBrandPreferencesFromBrief,
  type EnrichedBrandPreferences,
} from "./brand-brief-llm-extractor";
import { getEnterpriseApiRuntime } from "../platform/api/runtime/bootstrap-enterprise-api";

export type LearnBrandFromBriefInput = {
  readonly userId: string;
  readonly brandId: string;
  readonly organizationId?: string;
  readonly prompt?: string;
  readonly prompts?: readonly string[];
  readonly source?: string;
  readonly preExtracted?: ProductBrandPreferences;
  readonly integration?: IDirectExecutionEngine;
};

export type LearnBrandFromBriefResult = {
  readonly updated: boolean;
  readonly brandId?: string;
  readonly reason?: string;
  readonly extracted?: Record<string, unknown>;
  readonly extractionSource?: string;
};

function resolveIntegrationEngine(
  explicit?: IDirectExecutionEngine
): IDirectExecutionEngine | undefined {
  if (explicit) return explicit;
  return getEnterpriseApiRuntime()?.platform?.integrationEngine;
}

function stripExtractionSource(
  prefs: EnrichedBrandPreferences | ProductBrandPreferences
): ProductBrandPreferences {
  const { extractionSource: _ignored, ...rest } = prefs as EnrichedBrandPreferences;
  return rest;
}

async function resolvePreferencesForLearn(input: {
  readonly promptParts: readonly string[];
  readonly organizationId: string;
  readonly preExtracted?: ProductBrandPreferences;
  readonly integration?: IDirectExecutionEngine;
}): Promise<EnrichedBrandPreferences> {
  if (input.preExtracted) {
    return {
      ...input.preExtracted,
      extractionSource: "pre_extracted",
    };
  }

  const integration = resolveIntegrationEngine(input.integration);
  if (integration) {
    return enrichBrandPreferencesFromBrief({
      prompt: input.promptParts.join("\n"),
      prompts: input.promptParts,
      integration,
      organizationId: input.organizationId,
    });
  }

  return {
    ...mergeBrandPreferencesFromPrompts(input.promptParts),
    extractionSource: "heuristic_fallback",
  };
}

export async function learnBrandKnowledgeFromBrief(
  input: LearnBrandFromBriefInput
): Promise<LearnBrandFromBriefResult> {
  const brandId = input.brandId?.trim();
  if (!brandId) return { updated: false, reason: "missing_brand_id" };

  const promptParts = [
    ...(input.prompts ?? []).map((p) => p.trim()).filter(Boolean),
    ...(input.prompt?.trim() ? [input.prompt.trim()] : []),
  ];
  if (!promptParts.length) return { updated: false, brandId, reason: "empty_prompt" };

  const brand = await brandService.get({
    userId: input.userId,
    brandId,
  });
  const organizationId =
    input.organizationId?.trim() || brand.organizationId?.trim();
  if (!organizationId) {
    return { updated: false, brandId, reason: "missing_organization" };
  }

  const preferences = await resolvePreferencesForLearn({
    promptParts,
    organizationId,
    preExtracted: input.preExtracted,
    integration: input.integration,
  });
  const hasAny = Object.values(stripExtractionSource(preferences)).some((v) =>
    Array.isArray(v) ? v.length > 0 : typeof v === "string" && v.trim()
  );
  if (!hasAny) {
    return {
      updated: false,
      brandId,
      reason: "no_extractable_facts",
      extractionSource: preferences.extractionSource,
    };
  }

  const result = await mergePreferencesIntoProductBrand({
    organizationId,
    brandId,
    preferences: stripExtractionSource(preferences),
    source: input.source ?? "learn_from_brief",
  });

  return {
    updated: result.updated === true,
    brandId: result.brandId ?? brandId,
    reason: result.reason,
    extracted: stripExtractionSource(preferences) as Record<string, unknown>,
    ...(preferences.extractionSource
      ? { extractionSource: preferences.extractionSource }
      : {}),
  };
}

/** Fire-and-forget — never throws. */
export function scheduleLearnBrandKnowledgeFromBrief(
  input: LearnBrandFromBriefInput
): void {
  void learnBrandKnowledgeFromBrief(input).catch(() => {
    /* non-fatal */
  });
}

/** Used when only prompt text is available (no auth context) — org must be trusted. */
export async function learnBrandKnowledgeFromPromptUntrusted(input: {
  readonly organizationId: string;
  readonly brandId: string;
  readonly prompt: string;
  readonly source?: string;
  readonly preExtracted?: ProductBrandPreferences;
  readonly integration?: IDirectExecutionEngine;
}): Promise<LearnBrandFromBriefResult> {
  let preferences: EnrichedBrandPreferences;
  if (input.preExtracted) {
    preferences = { ...input.preExtracted, extractionSource: "pre_extracted" };
  } else {
    const integration = resolveIntegrationEngine(input.integration);
    preferences = integration
      ? await enrichBrandPreferencesFromBrief({
          prompt: input.prompt,
          integration,
          organizationId: input.organizationId,
        })
      : {
          ...extractBrandPreferencesFromPrompt(input.prompt),
          extractionSource: "heuristic_fallback",
        };
  }

  const persistable = stripExtractionSource(preferences);
  const hasAny = Object.values(persistable).some((v) =>
    Array.isArray(v) ? v.length > 0 : typeof v === "string" && v.trim()
  );
  if (!hasAny) {
    return {
      updated: false,
      brandId: input.brandId,
      reason: "no_extractable_facts",
      extractionSource: preferences.extractionSource,
    };
  }

  const result = await mergePreferencesIntoProductBrand({
    organizationId: input.organizationId,
    brandId: input.brandId,
    preferences: persistable,
    source: input.source ?? "execution_create",
  });

  return {
    updated: result.updated === true,
    brandId: result.brandId ?? input.brandId,
    reason: result.reason,
    extracted: persistable as Record<string, unknown>,
    ...(preferences.extractionSource
      ? { extractionSource: preferences.extractionSource }
      : {}),
  };
}

export function scheduleLearnBrandKnowledgeFromPromptUntrusted(input: {
  readonly organizationId: string;
  readonly brandId: string;
  readonly prompt: string;
  readonly source?: string;
  readonly preExtracted?: ProductBrandPreferences;
  readonly integration?: IDirectExecutionEngine;
}): void {
  void learnBrandKnowledgeFromPromptUntrusted(input).catch(() => {
    /* non-fatal */
  });
}
