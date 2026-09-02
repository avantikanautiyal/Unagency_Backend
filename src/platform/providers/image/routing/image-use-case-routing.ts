/**
 * Client model matrix → image.generate provider preference.
 * Prefer first executable match; never cross modalities.
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

/**
 * Ordered preferences from the Unagency provider matrix (Campaigns / Landing Pages).
 * Only providers with LIVE adapters + credentials become executable.
 */
export const IMAGE_USE_CASE_PREFERENCES: Record<
  ImageCreativeUseCase,
  readonly ImageProviderPreference[]
> = {
  logo: [
    { providerId: "provider.recraft", modelId: "recraft-v3", label: "Recraft V3" },
    { providerId: "provider.openai", modelId: "gpt-image-1", label: "GPT Image" },
    { providerId: "provider.ideogram", modelId: "ideogram-3", label: "Ideogram 3" },
    { providerId: "provider.google", modelId: "gemini-2.5-flash-image", label: "Imagen 4" },
    { providerId: "provider.openai", modelId: "gpt-image-1.5", label: "GPT Image 1.5" },
  ],
  brand_imagery: [
    { providerId: "provider.openai", modelId: "gpt-image-1", label: "GPT Image" },
    { providerId: "provider.google", modelId: "gemini-2.5-flash-image", label: "Imagen 4" },
    { providerId: "provider.ideogram", modelId: "ideogram-3", label: "Ideogram 3" },
    { providerId: "provider.recraft", modelId: "recraft-v3", label: "Recraft V3" },
    { providerId: "provider.openai", modelId: "gpt-image-2", label: "Freepik (alt)" },
  ],
  marketing_creative: [
    { providerId: "provider.openai", modelId: "gpt-image-2", label: "GPT Image" },
    { providerId: "provider.google", modelId: "gemini-3-pro-image", label: "Gemini Pro Image" },
    { providerId: "provider.ideogram", modelId: "ideogram-3", label: "Ideogram 3" },
    { providerId: "provider.recraft", modelId: "recraft-v3", label: "Recraft V3" },
    { providerId: "provider.openai", modelId: "gpt-image-1", label: "Midjourney (alt)" },
  ],
  photorealistic: [
    { providerId: "provider.google", modelId: "gemini-2.5-flash-image", label: "Imagen 4" },
    { providerId: "provider.openai", modelId: "gpt-image-1", label: "GPT Image" },
    { providerId: "provider.ideogram", modelId: "ideogram-3", label: "Ideogram 3" },
    { providerId: "provider.openai", modelId: "gpt-image-1.5", label: "Picsart (alt)" },
  ],
  typography: [
    { providerId: "provider.ideogram", modelId: "ideogram-3", label: "Ideogram 3" },
    { providerId: "provider.recraft", modelId: "recraft-v3", label: "Recraft V3" },
    { providerId: "provider.openai", modelId: "gpt-image-1", label: "GPT Image" },
    { providerId: "provider.google", modelId: "gemini-2.5-flash-image", label: "Gemini Flash Image" },
  ],
  product: [
    { providerId: "provider.openai", modelId: "gpt-image-1", label: "GPT Image" },
    { providerId: "provider.google", modelId: "gemini-2.5-flash-image", label: "Reve Image (alt)" },
    { providerId: "provider.ideogram", modelId: "ideogram-3", label: "Ideogram 3" },
    { providerId: "provider.openai", modelId: "gpt-image-1.5", label: "HiDream (alt)" },
  ],
  general: [
    { providerId: "provider.openai", modelId: "gpt-image-1", label: "GPT Image" },
    { providerId: "provider.google", modelId: "gemini-2.5-flash-image", label: "Gemini Flash Image" },
    { providerId: "provider.openai", modelId: "gpt-image-1.5", label: "GPT Image 1.5" },
    { providerId: "provider.ideogram", modelId: "ideogram-3", label: "Ideogram 3" },
    { providerId: "provider.recraft", modelId: "recraft-v3", label: "Recraft V3" },
  ],
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

/** Distinct providers from the matrix that are LIVE (for parallel route fan-out). */
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
      if (seen.has(pref.providerId)) continue;
      seen.add(pref.providerId);
      out.push(pref);
      if (out.length >= max) return out;
    }
  }
  return out;
}

/** Index of a provider in the distinct matrix order (includes non-LIVE slots). */
export function matrixDistinctProviderIndex(
  useCase: ImageCreativeUseCase,
  providerId: string
): number {
  const seen = new Set<string>();
  let index = 0;
  for (const pref of IMAGE_USE_CASE_PREFERENCES[useCase]) {
    if (seen.has(pref.providerId)) continue;
    seen.add(pref.providerId);
    if (pref.providerId === providerId) return index;
    index += 1;
  }
  for (const pref of IMAGE_USE_CASE_PREFERENCES.general) {
    if (seen.has(pref.providerId)) continue;
    seen.add(pref.providerId);
    if (pref.providerId === providerId) return index;
    index += 1;
  }
  return -1;
}
