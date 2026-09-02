/**
 * Social content format overlays — extends social/content-design contracts.
 * Source: c29Formats.ts (58 formats × 8 platforms).
 */

import type { ContractRequirement } from "./evaluation-methods";
import type { ServiceOutputKind } from "../../../config/service-output-map";
import { isVideoSocialFormat } from "../../../config/service-output-map";

export const SOCIAL_FORMAT_IDS = Object.freeze([
  "feed-post",
  "feed-post-2",
  "feed-post-3",
  "feed-post-4",
  "carousel-post",
  "reels",
  "stories",
  "story-highlights-cover",
  "profile-picture",
  "image-243",
  "vertical-video",
  "square-video",
  "landscape-video",
  "company-cover-banner",
  "newsletter-cover",
  "cover-photo",
  "reels-2",
  "group-cover",
  "page-cover-video",
  "image-269",
  "header-cover-banner",
  "community-header",
  "video-post-landscape",
  "poll-graphic",
  "quote-post-graphic",
  "thumbnail",
  "channel-banner",
  "channel-profile-picture",
  "youtube-shorts-cover",
  "image-285",
  "image-286",
  "image-287",
  "image-288",
  "feed-video-vertical",
  "feed-image-post-single",
  "photo-carousel",
  "profile-picture-2",
  "profile-cover-photo",
  "story",
  "live-cover",
  "spark-ads",
  "brand-takeover-ad",
  "image-302",
  "story-snap",
  "spotlight-video",
  "collection-ad",
  "dynamic-product-ad",
  "commercial-ad",
  "public-profile-cover",
  "status",
  "catalog-product-image",
  "business-profile-photo",
] as const);

export type SocialFormatId = (typeof SOCIAL_FORMAT_IDS)[number];

const LEGACY_FEED_POST_FORMAT_MAP: Record<string, string> = {
  "feed-post-square": "feed-post",
  "feed-post-portrait": "feed-post",
  "feed-post-landscape": "feed-post",
  "feed-post-square-2": "feed-post-2",
  "feed-post-portrait-2": "feed-post-2",
  "feed-post-landscape-2": "feed-post-2",
  "feed-post-square-3": "feed-post-3",
  "feed-post-portrait-3": "feed-post-3",
  "feed-post-landscape-3": "feed-post-3",
  "feed-post-square-4": "feed-post-4",
  "feed-post-portrait-4": "feed-post-4",
  "feed-post-landscape-4": "feed-post-4",
};

function isPromptSizedFeedPostFormat(format: string): boolean {
  const f = format.toLowerCase();
  if (/^feed-post(-\d+)?$/.test(f)) return true;
  return f in LEGACY_FEED_POST_FORMAT_MAP;
}

/** Infer aspect ratio from format id — mirrors frontend aspectRatioForFormat. */
export function aspectRatioForFormat(format?: string): string | undefined {
  if (!format) return undefined;
  const f = format.toLowerCase();
  if (isPromptSizedFeedPostFormat(f)) return undefined;
  if (/\bsquare\b/.test(f) || f === "profile-picture" || f.includes("profile-picture")) {
    return "1:1";
  }
  if (
    /\b(portrait|stories?|reels?|shorts?|vertical|story|spotlight|status)\b/.test(f) ||
    f.includes("vertical-video") ||
    f.includes("feed-video-vertical")
  ) {
    return "9:16";
  }
  if (
    /\b(landscape|banner|cover|thumbnail|header|widescreen)\b/.test(f) ||
    f.includes("landscape-video") ||
    f.includes("channel-banner") ||
    f.includes("company-cover")
  ) {
    return "16:9";
  }
  if (/\bcarousel\b/.test(f)) return "1:1";
  if (
    (f.includes("feed") || f.includes("post") || f.includes("graphic")) &&
    !isPromptSizedFeedPostFormat(f)
  ) {
    return "1:1";
  }
  return undefined;
}

/** Target clip length (seconds) from product format — clamped for MiniMax (6|10). */
export function durationForFormat(
  format?: string,
  service?: string,
  subtype?: string
): number | undefined {
  const f = (format ?? "").toLowerCase();
  const svc = (service ?? "").toLowerCase();
  const sub = (subtype ?? "").toLowerCase();

  if (
    /\b(reels?|stories?|shorts?|vertical-video|feed-video-vertical|spotlight|tiktok)\b/.test(
      f
    ) ||
    svc === "social"
  ) {
    return 10;
  }
  if (
    svc === "video" &&
    /\b(corporate|film|commercial|brand|motion|documentary)\b/.test(sub)
  ) {
    return 10;
  }
  if (svc === "ads" || /\b(commercial|video|motion|film|reel)\b/.test(f)) {
    return 10;
  }
  if (isVideoFormat(format)) return 6;
  return undefined;
}

export function isVideoFormat(format?: string): boolean {
  return isVideoSocialFormat(format);
}

export function effectiveKindForSocialFormat(
  baseKind: ServiceOutputKind,
  format?: string,
): ServiceOutputKind {
  if (baseKind !== "image" && baseKind !== "video") return baseKind;
  return isVideoFormat(format) ? "video" : baseKind;
}

export function formatOverlayRequirements(
  format: string,
  platform?: string,
): readonly ContractRequirement[] {
  const aspectRatio = aspectRatioForFormat(format);
  const video = isVideoFormat(format);
  const reqs: ContractRequirement[] = [
    {
      id: `format.${format}.platform_fit`,
      class: "hard",
      category: "format",
      description: `Creative must fit ${platform ?? "platform"} format "${format}" specifications`,
      evaluation: {
        method: "artifact_inspection",
        expectedResult: "dimensions and layout match platform format",
        severity: "high",
        blocksCompletion: true,
      },
    },
  ];
  if (aspectRatio) {
    reqs.push({
      id: `format.${format}.aspect_ratio`,
      class: "hard",
      category: "format",
      description: `Output must use ${aspectRatio} aspect ratio for format ${format}`,
      evaluation: {
        method: "artifact_inspection",
        expectedResult: aspectRatio,
        severity: "high",
        blocksCompletion: true,
      },
    });
  }
  if (video) {
    reqs.push({
      id: `format.${format}.video_artifact`,
      class: "hard",
      category: "deliverable",
      description: "Video format requires mp4 video artifact",
      evaluation: {
        method: "artifact_inspection",
        expectedResult: "video/mp4 artifact present",
        severity: "critical",
        blocksCompletion: true,
      },
    });
  } else {
    reqs.push({
      id: `format.${format}.image_artifact`,
      class: "hard",
      category: "deliverable",
      description: "Image format requires raster image artifact (png/jpg)",
      evaluation: {
        method: "artifact_inspection",
        expectedResult: "image/png or image/jpeg artifact present",
        severity: "critical",
        blocksCompletion: true,
      },
    });
  }
  return Object.freeze(reqs);
}

export function formatOverlayContractId(format: string): string {
  return `format.social.content-design.${format}`;
}

export const FORMAT_OVERLAY_VERSION = "1.0.0" as const;
