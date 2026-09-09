/**
 * Resolve a Format & Production Spec rule from service/platform/format selection.
 */

import {
  ALL_PRODUCTION_RULES,
  SOCIAL_PLATFORM_RULES,
} from "./rules/social-platforms";
import {
  SERVICE_DEFAULT_RULES,
  SERVICE_SUBTYPE_TO_RULE_ID,
} from "./rules/service-defaults";
import type {
  ProductionRule,
  ResolveProductionRuleInput,
  ResolvedProductionRule,
} from "./types";

const RULES_BY_ID: ReadonlyMap<string, ProductionRule> = (() => {
  const map = new Map<string, ProductionRule>();
  for (const r of ALL_PRODUCTION_RULES) {
    map.set(r.id, r);
  }
  return map;
})();

/**
 * Product format ids (C29 / conversation state) → Spec rule id.
 * Feed posts default to the square house master; portrait/landscape need
 * explicit placementId or a ratio-qualified format id.
 */
const FORMAT_TO_RULE_ID: Readonly<Record<string, string>> = Object.freeze({
  // Instagram
  "instagram:feed-post": "instagram.feed.square",
  "instagram:feed-post-square": "instagram.feed.square",
  "instagram:feed-post-portrait": "instagram.feed.portrait",
  "instagram:feed-post-landscape": "instagram.feed.landscape",
  "instagram:carousel-post": "instagram.carousel",
  "instagram:reels": "instagram.reels",
  "instagram:stories": "instagram.stories",
  "instagram:story-highlights-cover": "instagram.story-highlights",
  "instagram:profile-picture": "instagram.profile-picture",

  // Facebook
  "facebook:feed-post": "facebook.feed.square",
  "facebook:feed-post-3": "facebook.feed.square",
  "facebook:feed-post-square-3": "facebook.feed.square",
  "facebook:feed-post-portrait-3": "facebook.feed.portrait",
  "facebook:feed-post-landscape-3": "facebook.feed.landscape",
  "facebook:cover-photo": "facebook.cover-photo",
  "facebook:reels": "facebook.reels",
  "facebook:reels-2": "facebook.reels",
  "facebook:stories": "facebook.stories",
  "facebook:group-cover": "facebook.group-cover",
  "facebook:page-cover-video": "facebook.page-cover-video",
  "facebook:profile-picture": "facebook.profile-picture",

  // LinkedIn
  "linkedin:feed-post": "linkedin.organic.square",
  "linkedin:feed-post-2": "linkedin.organic.square",
  "linkedin:feed-post-square-2": "linkedin.organic.square",
  "linkedin:feed-post-portrait-2": "linkedin.organic.portrait",
  "linkedin:feed-post-landscape-2": "linkedin.organic.landscape",
  "linkedin:image-243": "linkedin.document-pages",
  "linkedin:vertical-video": "linkedin.video.vertical",
  "linkedin:square-video": "linkedin.video.square",
  "linkedin:landscape-video": "linkedin.video.landscape",
  "linkedin:company-cover-banner": "linkedin.company-cover",
  "linkedin:newsletter-cover": "linkedin.newsletter-cover",

  // X (Twitter)
  "x:feed-post": "x.square",
  "x:feed-post-4": "x.square",
  "x:feed-post-square-4": "x.square",
  "x:feed-post-portrait-4": "x.portrait",
  "x:feed-post-landscape-4": "x.single-image.landscape",
  "x:image-269": "x.square",
  "x:header-cover-banner": "x.header",
  "x:community-header": "x.community-header",
  "x:video-post-landscape": "x.video.landscape",
  "x:poll-graphic": "x.poll-graphic",
  "x:quote-post-graphic": "x.quote-post",
  "twitter:feed-post-4": "x.square",
  "twitter:image-269": "x.square",
  "twitter:header-cover-banner": "x.header",
  "twitter:community-header": "x.community-header",
  "twitter:video-post-landscape": "x.video.landscape",
  "twitter:poll-graphic": "x.poll-graphic",
  "twitter:quote-post-graphic": "x.quote-post",

  // YouTube — Spec masters override legacy C29 artboard sizes
  "youtube:thumbnail": "youtube.video-thumbnail",
  "youtube:channel-banner": "youtube.channel-banner",
  "youtube:channel-profile-picture": "youtube.channel-profile",
  "youtube:youtube-shorts-cover": "youtube.shorts-thumbnail",
  "youtube:image-285": "youtube.video-end-screen",
  "youtube:image-286": "youtube.community.portrait",
  "youtube:image-287": "youtube.community.landscape",
  "youtube:image-288": "youtube.video-end-screen",

  // TikTok
  "tiktok:feed-video-vertical": "tiktok.feed",
  "tiktok:feed-image-post-single": "tiktok.feed-image",
  "tiktok:photo-carousel": "tiktok.photo-carousel",
  "tiktok:profile-picture": "tiktok.profile-picture",
  "tiktok:profile-picture-2": "tiktok.profile-picture",
  "tiktok:profile-cover-photo": "tiktok.profile-cover",
  "tiktok:story": "tiktok.story",
  "tiktok:live-cover": "tiktok.live-cover",
  "tiktok:spark-ads": "tiktok.spark-ads",

  // Snapchat
  "snapchat:brand-takeover-ad": "snapchat.brand-takeover",
  "snapchat:image-302": "snapchat.ad.single",
  "snapchat:story-snap": "snapchat.story-snap",
  "snapchat:spotlight-video": "snapchat.spotlight",
  "snapchat:collection-ad": "snapchat.ad.collection",
  "snapchat:dynamic-product-ad": "snapchat.dynamic-product",
  "snapchat:commercial-ad": "snapchat.ad.commercial",

  // WhatsApp
  "whatsapp:status": "whatsapp.status",
  "whatsapp:catalog-product-image": "whatsapp.catalog-product",
  "whatsapp:business-profile-photo": "whatsapp.business-profile",
  "whatsapp:public-profile-cover": "whatsapp.public-profile-cover",
});

function normalizePlatform(platform?: string): string | undefined {
  if (!platform) return undefined;
  const p = platform.trim().toLowerCase();
  if (p === "ig" || p === "insta") return "instagram";
  if (p === "li" || p === "linked-in") return "linkedin";
  if (p === "fb" || p === "meta") return "facebook";
  if (p === "twitter" || p === "x.com") return "x";
  if (p === "yt" || p === "you-tube") return "youtube";
  if (p === "tt") return "tiktok";
  if (p === "sc" || p === "snap") return "snapchat";
  if (p === "wa" || p === "whats-app") return "whatsapp";
  return p;
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeService(service?: string): string | undefined {
  if (!service) return undefined;
  const s = service.trim().toLowerCase();
  if (s === "web" || s === "web-tech" || s === "webtech") return "website";
  if (s === "presentation") return "presentations";
  if (
    s === "visual-production" ||
    s === "visual_production" ||
    s === "visualproduction" ||
    s === "photo"
  ) {
    return "photography";
  }
  if (s === "brand-strategy" || s === "brandstrategy") return "strategy";
  if (s === "in-store" || s === "instore" || s === "pos-in-store") return "pos";
  if (s === "ad" || s === "advertising" || s === "ad-campaigns") return "ads";
  if (s === "events" || s === "event-branding") return "event";
  if (s === "merch") return "merchandise";
  return s;
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}

/** Canonical aspect ratio string from canvas pixels (e.g. 1080×1350 → "4:5"). */
export function aspectRatioFromCanvas(
  width: number,
  height: number,
): string {
  const d = gcd(width, height);
  return `${width / d}:${height / d}`;
}

export function getProductionRuleById(
  id: string,
): ProductionRule | undefined {
  return RULES_BY_ID.get(normalizeKey(id)) ?? RULES_BY_ID.get(id);
}

export function listProductionRules(): readonly ProductionRule[] {
  return ALL_PRODUCTION_RULES;
}

export function listProductionRulesForPlatform(
  platform: string,
): readonly ProductionRule[] {
  const p = normalizePlatform(platform);
  if (!p) return Object.freeze([]);
  return Object.freeze(SOCIAL_PLATFORM_RULES.filter((r) => r.platform === p));
}

export function listServiceDefaultRules(): readonly ProductionRule[] {
  return SERVICE_DEFAULT_RULES;
}

function resolveServiceDefault(
  service?: string,
  subtype?: string,
): ResolvedProductionRule | undefined {
  const svc = normalizeService(service);
  const sub = subtype?.trim().toLowerCase();
  if (!svc) return undefined;
  const key = sub ? `${svc}/${sub}` : undefined;
  const mapped = key ? SERVICE_SUBTYPE_TO_RULE_ID[key] : undefined;
  if (mapped) {
    const rule = getProductionRuleById(mapped);
    if (rule) {
      return Object.freeze({ rule, matchedBy: "serviceDefault" as const });
    }
  }

  // Prefer explicit other/catch-all before arbitrary first-rule fallback.
  const otherMapped = SERVICE_SUBTYPE_TO_RULE_ID[`${svc}/other`];
  if (otherMapped) {
    const otherRule = getProductionRuleById(otherMapped);
    if (otherRule) {
      return Object.freeze({
        rule: otherRule,
        matchedBy: "serviceDefault" as const,
      });
    }
  }

  const wildcardMapped = SERVICE_SUBTYPE_TO_RULE_ID[`${svc}/*`];
  if (wildcardMapped) {
    const wild = getProductionRuleById(wildcardMapped);
    if (wild) {
      return Object.freeze({ rule: wild, matchedBy: "serviceDefault" as const });
    }
  }

  const fallback = SERVICE_DEFAULT_RULES.find((r) => r.service === svc);
  if (fallback) {
    return Object.freeze({ rule: fallback, matchedBy: "serviceDefault" as const });
  }
  return undefined;
}

/**
 * Resolve the production rule for a selected placement.
 * Precedence: placementId → platform+formatId → rule id as formatId → service/subtype default.
 */
export function resolveProductionRule(
  input: ResolveProductionRuleInput,
): ResolvedProductionRule | undefined {
  const placementId = input.placementId?.trim();
  if (placementId) {
    const byPlacement = getProductionRuleById(placementId);
    if (byPlacement) {
      return Object.freeze({ rule: byPlacement, matchedBy: "placementId" as const });
    }
  }

  const platform = normalizePlatform(input.platform);
  const formatId = input.formatId?.trim();
  if (platform && formatId) {
    const mapped =
      FORMAT_TO_RULE_ID[`${platform}:${normalizeKey(formatId)}`] ??
      FORMAT_TO_RULE_ID[`${platform}:${formatId}`];
    if (mapped) {
      const rule = getProductionRuleById(mapped);
      if (rule) {
        return Object.freeze({ rule, matchedBy: "formatMapping" as const });
      }
    }
  }

  if (formatId) {
    const asRule =
      getProductionRuleById(formatId) ??
      (platform ? getProductionRuleById(`${platform}.${normalizeKey(formatId)}`) : undefined);
    if (asRule) {
      return Object.freeze({
        rule: asRule,
        matchedBy: "platformPlacement" as const,
      });
    }
  }

  return resolveServiceDefault(input.service, input.subtype);
}

/** Whether an approved release is allowed for this rule without further confirmation. */
export function isProductionRuleReleasable(
  rule: ProductionRule,
): boolean {
  if (rule.blocksReleaseIfUnconfirmed) return false;
  if (rule.status === "R" || rule.status === "H") return false;
  return true;
}

/** Spec export format labels for a resolved placement (png/jpg/mp4/…). */
export function resolveProductionExportFormats(
  input: ResolveProductionRuleInput,
): readonly string[] | undefined {
  const resolved = resolveProductionRule(input);
  const formats = resolved?.rule.export?.formats;
  return formats?.length ? formats : undefined;
}

/** C29 / product format keys mapped to Spec rule ids (platform:formatId). */
export function listFormatToRuleIdEntries(): ReadonlyArray<{
  readonly platform: string;
  readonly formatId: string;
  readonly ruleId: string;
}> {
  const out: { platform: string; formatId: string; ruleId: string }[] = [];
  for (const [key, ruleId] of Object.entries(FORMAT_TO_RULE_ID)) {
    const colon = key.indexOf(":");
    if (colon <= 0) continue;
    out.push(
      Object.freeze({
        platform: key.slice(0, colon),
        formatId: key.slice(colon + 1),
        ruleId,
      }),
    );
  }
  return Object.freeze(out);
}
