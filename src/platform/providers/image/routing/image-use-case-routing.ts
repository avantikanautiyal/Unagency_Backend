/**
 * Client model matrix → image.generate provider preference.
 * Prefer first executable match; never cross modalities.
 *
 * Declared fanout slots: Gemini primary + Gemini secondary (distinct model) + OpenAI.
 * Inventory availability must not silently collapse declared fanout cardinality.
 */

import {
  resolveImageCreativeUseCaseFromContext,
  type ImageCreativeUseCase,
} from "../../routing/matrix/matrix-use-case-routing";

export type { ImageCreativeUseCase } from "../../routing/matrix/matrix-use-case-routing";

export type ImageProviderPreference = {
  readonly providerId: string;
  readonly modelId: string;
  readonly label: string;
};

/** Primary — native reference-image + edit support (no input_fidelity wire param). */
const GEMINI_FLASH_IMAGE: ImageProviderPreference = {
  providerId: "provider.google",
  modelId: "gemini-3.1-flash-image",
  label: "Gemini 3.1 Flash Image",
};
/** OpenAI leaf — supports input_fidelity on reference-image edits. */
const CHATGPT_IMAGE_ALT: ImageProviderPreference = {
  providerId: "provider.openai",
  modelId: "gpt-image-1.5",
  label: "GPT Image 1.5",
};
const GEMINI_PRO_IMAGE: ImageProviderPreference = {
  providerId: "provider.google",
  modelId: "gemini-3-pro-image",
  label: "Gemini 3 Pro Image",
};

/**
 * Ordered preferences — three distinct models, no repeats.
 * Ideogram is not an active fanout target.
 */
export const IMAGE_USE_CASE_PREFERENCES: Record<
  ImageCreativeUseCase,
  readonly ImageProviderPreference[]
> = {
  logo: [GEMINI_FLASH_IMAGE, GEMINI_PRO_IMAGE, CHATGPT_IMAGE_ALT],
  brand_imagery: [GEMINI_FLASH_IMAGE, GEMINI_PRO_IMAGE, CHATGPT_IMAGE_ALT],
  marketing_creative: [GEMINI_FLASH_IMAGE, GEMINI_PRO_IMAGE, CHATGPT_IMAGE_ALT],
  photorealistic: [GEMINI_PRO_IMAGE, GEMINI_FLASH_IMAGE, CHATGPT_IMAGE_ALT],
  typography: [GEMINI_FLASH_IMAGE, CHATGPT_IMAGE_ALT, GEMINI_PRO_IMAGE],
  product: [GEMINI_FLASH_IMAGE, GEMINI_PRO_IMAGE, CHATGPT_IMAGE_ALT],
  general: [GEMINI_FLASH_IMAGE, GEMINI_PRO_IMAGE, CHATGPT_IMAGE_ALT],
};

export function resolveImageCreativeUseCase(
  prompt: string,
  context?: { service?: string; platform?: string; subtype?: string }
): ImageCreativeUseCase {
  return resolveImageCreativeUseCaseFromContext(prompt, context);
}

export function pickPreferredImageProvider(
  useCase: ImageCreativeUseCase,
  executableProviderIds: ReadonlySet<string>
): ImageProviderPreference | undefined {
  for (const pref of IMAGE_USE_CASE_PREFERENCES[useCase]) {
    if (executableProviderIds.has(pref.providerId)) return pref;
  }
  return undefined;
}

function preferenceKey(pref: ImageProviderPreference): string {
  return `${pref.providerId}::${pref.modelId}`;
}

/**
 * Executable model slots from the matrix (allows two Google models).
 * Name retained for call-site compatibility.
 */
export function listDistinctExecutableImageProviders(
  useCase: ImageCreativeUseCase,
  executableProviderIds: ReadonlySet<string>,
  max = 3
): ImageProviderPreference[] {
  const chains = [
    IMAGE_USE_CASE_PREFERENCES[useCase],
    IMAGE_USE_CASE_PREFERENCES.general,
  ];
  const seen = new Set<string>();
  const out: ImageProviderPreference[] = [];
  for (const chain of chains) {
    for (const pref of chain) {
      if (!executableProviderIds.has(pref.providerId)) continue;
      const key = preferenceKey(pref);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(pref);
      if (out.length >= max) return out;
    }
  }
  return out;
}

/** Index of a model slot in matrix order (provider::model). */
export function matrixDistinctProviderIndex(
  useCase: ImageCreativeUseCase,
  providerId: string,
  modelId?: string
): number {
  const seen = new Set<string>();
  let index = 0;
  const match = (pref: ImageProviderPreference): boolean =>
    pref.providerId === providerId &&
    (modelId === undefined || pref.modelId === modelId);

  for (const pref of IMAGE_USE_CASE_PREFERENCES[useCase]) {
    const key = preferenceKey(pref);
    if (seen.has(key)) continue;
    seen.add(key);
    if (match(pref)) return index;
    index += 1;
  }
  for (const pref of IMAGE_USE_CASE_PREFERENCES.general) {
    const key = preferenceKey(pref);
    if (seen.has(key)) continue;
    seen.add(key);
    if (match(pref)) return index;
    index += 1;
  }
  return -1;
}
