/**
 * Client model matrix → image.generate provider preference.
 * Prefer first executable match; never cross modalities.
 */

export type ImageCreativeUseCase =
  | "logo"
  | "brand_imagery"
  | "marketing_creative"
  | "photorealistic"
  | "typography"
  | "product"
  | "general";

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
  // Matrix: Recraft V3 — Logos, vectors
  logo: [
    { providerId: "provider.recraft", modelId: "recraft-v3", label: "Recraft V3" },
    { providerId: "provider.openai", modelId: "gpt-image-1", label: "GPT Image" },
    { providerId: "provider.google", modelId: "gemini-2.5-flash-image", label: "Gemini Flash Image" },
    { providerId: "provider.ideogram", modelId: "ideogram-3", label: "Ideogram 3" },
    { providerId: "provider.openai", modelId: "gpt-image-1.5", label: "GPT Image 1.5" },
  ],
  // Matrix: brand imagery — billed OpenAI/Google first; FLUX only when BFL_ENABLED
  brand_imagery: [
    { providerId: "provider.openai", modelId: "gpt-image-1", label: "GPT Image" },
    { providerId: "provider.google", modelId: "gemini-2.5-flash-image", label: "Gemini Flash Image" },
    { providerId: "provider.blackforestlabs", modelId: "flux-kontext-pro", label: "FLUX Kontext Pro" },
    { providerId: "provider.recraft", modelId: "recraft-v3", label: "Recraft V3" },
  ],
  // Matrix: GPT Image — Marketing creatives, editing
  marketing_creative: [
    { providerId: "provider.openai", modelId: "gpt-image-1", label: "GPT Image" },
    { providerId: "provider.google", modelId: "gemini-2.5-flash-image", label: "Gemini Flash Image" },
    { providerId: "provider.blackforestlabs", modelId: "flux-kontext-pro", label: "FLUX Kontext Pro" },
    { providerId: "provider.ideogram", modelId: "ideogram-3", label: "Ideogram 3" },
  ],
  // Matrix: Imagen / Gemini image — Photorealistic assets
  photorealistic: [
    { providerId: "provider.google", modelId: "gemini-2.5-flash-image", label: "Gemini Flash Image" },
    { providerId: "provider.openai", modelId: "gpt-image-1", label: "GPT Image" },
    { providerId: "provider.blackforestlabs", modelId: "flux-pro-1-1", label: "FLUX Pro 1.1" },
  ],
  // Matrix: Ideogram 3 — Typography, posters
  typography: [
    { providerId: "provider.ideogram", modelId: "ideogram-3", label: "Ideogram 3" },
    { providerId: "provider.recraft", modelId: "recraft-v3", label: "Recraft V3" },
    { providerId: "provider.openai", modelId: "gpt-image-1", label: "GPT Image" },
  ],
  // Matrix: product visualization → GPT Image / Gemini image
  product: [
    { providerId: "provider.openai", modelId: "gpt-image-1", label: "GPT Image" },
    { providerId: "provider.google", modelId: "gemini-2.5-flash-image", label: "Gemini Flash Image" },
    { providerId: "provider.blackforestlabs", modelId: "flux-kontext-pro", label: "FLUX Kontext Pro" },
  ],
  general: [
    { providerId: "provider.openai", modelId: "gpt-image-1", label: "GPT Image" },
    { providerId: "provider.google", modelId: "gemini-2.5-flash-image", label: "Gemini Flash Image" },
    { providerId: "provider.openai", modelId: "gpt-image-1.5", label: "GPT Image 1.5" },
    { providerId: "provider.blackforestlabs", modelId: "flux-kontext-pro", label: "FLUX Kontext Pro" },
    { providerId: "provider.recraft", modelId: "recraft-v3", label: "Recraft V3" },
    { providerId: "provider.ideogram", modelId: "ideogram-3", label: "Ideogram 3" },
  ],
};

export function resolveImageCreativeUseCase(prompt: string): ImageCreativeUseCase {
  const hay = prompt.toLowerCase();
  if (/\b(logo|wordmark|brand\s*mark|vector\s*logo|logotype)\b/.test(hay)) {
    return "logo";
  }
  if (/\b(poster|typography|typeface|lettering|typographic)\b/.test(hay)) {
    return "typography";
  }
  if (/\b(photo\s*real|photoreal|product\s*shot|packshot|lifestyle\s*photo)\b/.test(hay)) {
    return "photorealistic";
  }
  if (/\b(brand\s*imag|branding\s*visual|visual\s*identity|brand\s*system)\b/.test(hay)) {
    return "brand_imagery";
  }
  if (/\b(product\s*visual|product\s*mock|packaging\s*visual)\b/.test(hay)) {
    return "product";
  }
  if (/\b(landing\s*page|marketing|campaign|creative|banner|ad\b|hero)\b/.test(hay)) {
    return "marketing_creative";
  }
  if (/\b(design|image|visual|illustration)\b/.test(hay)) {
    return "general";
  }
  return "general";
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
