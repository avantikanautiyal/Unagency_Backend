/**
 * Service × subcategory → Provider Catalog Matrix routing.
 * Maps onboarding taxonomy (SERVICE_CATEGORIES) to matrix use-cases and
 * "Used In" buckets: Campaigns | Landing Pages | Coding.
 */

export type MatrixUsedIn = "campaigns" | "landing_pages" | "coding";

export type TextCreativeUseCase =
  | "strategy"
  | "copy"
  | "coding"
  | "website"
  | "creative"
  | "multilingual"
  | "research"
  | "general";

export type VideoCreativeUseCase =
  | "commercial_ad"
  | "filmmaking"
  | "cinematic"
  | "product"
  | "short_form"
  | "fast"
  | "marketing"
  | "fashion"
  | "general";

export type AudioCreativeUseCase =
  | "voiceover"
  | "realtime_agent"
  | "conversational"
  | "character"
  | "music"
  | "general";

export type ImageCreativeUseCase =
  | "logo"
  | "brand_imagery"
  | "marketing_creative"
  | "photorealistic"
  | "typography"
  | "product"
  | "general";

export type ServiceRoutingContext = {
  readonly service?: string;
  readonly subtype?: string;
  readonly platform?: string;
};

const WEBSITE_CODING_SUBTYPES = new Set([
  "app-development",
  "interactive-prototypes",
  "design-systems",
  "corporate-website",
  "ecom-website",
  "landing-page",
  "ui-design",
]);

const WEBSITE_LANDING_SUBTYPES = new Set([
  "landing-page",
  "corporate-website",
  "ecom-website",
  "ui-design",
  "visual-asset",
]);

function norm(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function resolveMatrixUsedIn(ctx: ServiceRoutingContext): MatrixUsedIn {
  const service = norm(ctx.service);
  if (service !== "website") return "campaigns";
  const subtype = norm(ctx.subtype);
  if (WEBSITE_CODING_SUBTYPES.has(subtype)) return "coding";
  if (WEBSITE_LANDING_SUBTYPES.has(subtype)) return "landing_pages";
  return "campaigns";
}

const IMAGE_SERVICE_USE_CASE: Readonly<Record<string, ImageCreativeUseCase>> = {
  "branding/logo-design": "logo",
  "branding/visual-identity": "brand_imagery",
  "branding/brand-guidelines": "brand_imagery",
  "print/posters": "typography",
  "print/print-ads": "marketing_creative",
  "print/ooh-design": "marketing_creative",
  "print/vehicle-design": "brand_imagery",
  "print/standees": "typography",
  "ads/performance-ads": "marketing_creative",
  "social/content-design": "marketing_creative",
  "website/visual-asset": "brand_imagery",
  "photography/product": "photorealistic",
  "photography/lifestyle": "photorealistic",
  "photography/corporate": "photorealistic",
  "photography/industrial": "photorealistic",
  "photography/event": "photorealistic",
  "photography/retouching": "photorealistic",
  "presentations/infographics": "marketing_creative",
  "event/content-design": "marketing_creative",
  "event/event-identity": "brand_imagery",
};

export function resolveImageUseCaseFromService(
  ctx: ServiceRoutingContext
): ImageCreativeUseCase | undefined {
  const service = norm(ctx.service);
  const subtype = norm(ctx.subtype);
  if (!service) return undefined;

  const exact = IMAGE_SERVICE_USE_CASE[`${service}/${subtype}`];
  if (exact) return exact;

  if (service === "packaging") return "product";
  if (service === "merchandise") return "product";
  if (service === "illustration") return "marketing_creative";
  if (service === "ads") return "marketing_creative";
  if (service === "event") return "marketing_creative";
  if (service === "pos") {
    return subtype === "branding-elements" ? "brand_imagery" : "product";
  }
  if (service === "branding") return "brand_imagery";
  if (service === "print") return "typography";
  if (service === "social") return "marketing_creative";
  return undefined;
}

const VIDEO_SERVICE_USE_CASE: Readonly<Record<string, VideoCreativeUseCase>> = {
  "video/corporate-films": "filmmaking",
  "video/explainer-videos": "marketing",
  "video/promo-videos": "commercial_ad",
  "video/motion-graphics": "marketing",
  "video/2d-animation": "short_form",
  "video/3d-animation": "cinematic",
  "video/vfx": "cinematic",
  "video/video-editing": "general",
  "ads/performance-ads": "commercial_ad",
  "presentations/gifs": "short_form",
  "event/event-concept": "marketing",
};

export function resolveVideoUseCaseFromService(
  ctx: ServiceRoutingContext
): VideoCreativeUseCase | undefined {
  const service = norm(ctx.service);
  const subtype = norm(ctx.subtype);
  const platform = norm(ctx.platform);
  if (!service) return undefined;

  const exact = VIDEO_SERVICE_USE_CASE[`${service}/${subtype}`];
  if (exact) return exact;

  if (service === "video") return "marketing";

  const productHay = `${service} ${platform} ${subtype}`;
  if (
    /\b(reels?|tiktok|shorts?|spotlight|short[- ]?form)\b/.test(productHay)
  ) {
    return "short_form";
  }
  if (service === "social" && platform) return "short_form";
  if (service === "ads") return "commercial_ad";
  if (service === "merchandise" && /\b(fashion|apparel|jackets|t-shirts)\b/.test(subtype)) {
    return "fashion";
  }
  return undefined;
}

export function resolveTextUseCaseFromService(
  ctx: ServiceRoutingContext,
  outputKind?: string
): TextCreativeUseCase | undefined {
  const service = norm(ctx.service);
  const subtype = norm(ctx.subtype);
  const kind = norm(outputKind);
  if (!service) return undefined;

  if (service === "website") {
    if (subtype === "ux-strategy") return "strategy";
    if (subtype === "visual-asset") return "creative";
    if (WEBSITE_CODING_SUBTYPES.has(subtype) || kind === "deferred_website") {
      return "website";
    }
    return "website";
  }

  if (service === "strategy") return "strategy";
  if (service === "social" && subtype === "strategy") return "strategy";
  if (service === "social" && subtype === "copywriting") return "copy";
  if (service === "email") return "copy";
  if (service === "presentations") return "strategy";
  if (service === "branding" && subtype === "brand-naming-taglines") return "creative";
  if (service === "video" && subtype === "storyboards") return "strategy";
  if (kind === "document" || kind === "presentation") return "strategy";
  if (kind === "text") return "copy";
  return undefined;
}

export function resolveAudioUseCaseFromService(
  ctx: ServiceRoutingContext
): AudioCreativeUseCase | undefined {
  const service = norm(ctx.service);
  const subtype = norm(ctx.subtype);
  if (!service) return undefined;

  if (service === "video") return "voiceover";
  if (service === "presentations" && subtype === "gifs") return "voiceover";
  if (service === "event") return "music";
  if (service === "ads") return "voiceover";
  return undefined;
}

/** Brand Strategy / social strategy jobs that need live web search before LLM synthesis. */
export function shouldPreferResearchForService(ctx: ServiceRoutingContext): boolean {
  const service = norm(ctx.service);
  const subtype = norm(ctx.subtype);
  return (
    service === "strategy" ||
    (service === "social" && subtype === "strategy") ||
    (service === "ads" && subtype === "performance-ads")
  );
}
