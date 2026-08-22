/**
 * Task-specific Brand Context field selection — deterministic.
 */

import type { BrandContext, BrandTaskKind } from "../contracts/brand-context";

export type BrandContextSectionKey =
  | "identity"
  | "positioning"
  | "audience"
  | "voice"
  | "tone"
  | "vocabulary"
  | "messaging"
  | "visualIdentity"
  | "creativePrinciples"
  | "communicationRules"
  | "prohibitedPatterns"
  | "preferredPatterns"
  | "ctaRules"
  | "assetReferences";

const COPY_SECTIONS: readonly BrandContextSectionKey[] = [
  "identity",
  "positioning",
  "audience",
  "voice",
  "tone",
  "vocabulary",
  "messaging",
  "preferredPatterns",
  "prohibitedPatterns",
  "ctaRules",
];

const IMAGE_SECTIONS: readonly BrandContextSectionKey[] = [
  "identity",
  "visualIdentity",
  "creativePrinciples",
  "prohibitedPatterns",
  "assetReferences",
];

const WEBSITE_SECTIONS: readonly BrandContextSectionKey[] = [
  "identity",
  "positioning",
  "audience",
  "voice",
  "tone",
  "messaging",
  "visualIdentity",
  "creativePrinciples",
  "communicationRules",
  "ctaRules",
];

const VIDEO_SECTIONS: readonly BrandContextSectionKey[] = [
  "identity",
  "voice",
  "tone",
  "messaging",
  "visualIdentity",
  "creativePrinciples",
  "prohibitedPatterns",
];

export function resolveBrandTaskKind(input: {
  readonly taskKind?: BrandTaskKind;
  readonly capabilityId?: string;
  readonly briefIntent?: string;
}): BrandTaskKind {
  if (input.taskKind) return input.taskKind;
  const intent = input.briefIntent?.trim();
  if (intent === "campaign") return "campaign";
  if (intent === "landing_page") return "landing_page";
  if (intent === "website") return "website";
  if (intent === "social_content") return "social_content";
  if (intent === "image") return "image";
  if (intent === "video") return "video";
  if (intent === "copy") return "copy";
  if (intent === "audio") return "audio";

  const cap = input.capabilityId ?? "";
  if (cap.startsWith("image.")) return "image";
  if (cap.startsWith("video.")) return "video";
  if (cap.startsWith("audio.")) return "audio";
  return "copy";
}

export function sectionsForTask(task: BrandTaskKind): readonly BrandContextSectionKey[] {
  switch (task) {
    case "image":
      return IMAGE_SECTIONS;
    case "video":
      return VIDEO_SECTIONS;
    case "website":
    case "landing_page":
      return WEBSITE_SECTIONS;
    case "campaign":
      return [
        ...COPY_SECTIONS,
        "visualIdentity",
        "creativePrinciples",
        "assetReferences",
      ] as const;
    case "social_content":
    case "copy":
    case "audio":
    case "other":
    default:
      return COPY_SECTIONS;
  }
}

/** Project full BrandContext down to task-relevant sections (shallow copy). */
export function selectBrandContextForTask(
  full: BrandContext,
  task: BrandTaskKind
): BrandContext {
  const allowed = new Set(sectionsForTask(task));
  return {
    ...full,
    identity: allowed.has("identity") ? full.identity : {},
    positioning: allowed.has("positioning") ? full.positioning : {},
    audience: allowed.has("audience") ? full.audience : {},
    voice: allowed.has("voice") ? full.voice : {},
    tone: allowed.has("tone") ? full.tone : {},
    vocabulary: allowed.has("vocabulary") ? full.vocabulary : {},
    messaging: allowed.has("messaging") ? full.messaging : {},
    visualIdentity: allowed.has("visualIdentity") ? full.visualIdentity : {},
    creativePrinciples: allowed.has("creativePrinciples")
      ? full.creativePrinciples
      : {},
    communicationRules: allowed.has("communicationRules")
      ? full.communicationRules
      : {},
    prohibitedPatterns: allowed.has("prohibitedPatterns")
      ? full.prohibitedPatterns
      : [],
    preferredPatterns: allowed.has("preferredPatterns")
      ? full.preferredPatterns
      : [],
    ctaRules: allowed.has("ctaRules") ? full.ctaRules : undefined,
    assetReferences: allowed.has("assetReferences") ? full.assetReferences : [],
  };
}
