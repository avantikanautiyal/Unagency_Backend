/**
 * Social Media artifact data schemas (M9A).
 * These are Artifact.data payloads — not the M3A envelope.
 *
 * Forensic: CDF social-media is a single-image creative path.
 * Carousel / reels / stories / caption posts are NOT CDF phases —
 * do not invent them here.
 */

import type { SocialMediaPixelCanvas } from "./coordinates";
import type { SocialMediaArtifactKey } from "./keys";

/** Shared provenance refs inside creative data (IDs only). */
export type SocialMediaSourceRefs = {
  sourceInputIds?: string[];
  requirementIds?: string[];
  activeBriefId?: string;
  activeBriefVersion?: number;
  contextId?: string;
  contextHash?: string;
  /** Provenance only — never asset/artifact identity. */
  executionId?: string;
  upstreamArtifactRefs?: Array<{
    artifactId: string;
    version: number;
    artifactKey: string;
  }>;
  /** Vault ObjectIds (24-hex) — never cdfart_* or exec_*. */
  vaultAssetIds?: string[];
};

/** Exact version pin — never "latest". */
export type SocialMediaExactArtifactRef = {
  artifactId: string;
  version: number;
  artifactKey?: SocialMediaArtifactKey | string;
};

/** Optional preview/render asset — representation, not SoT. */
export type SocialMediaPreviewAssetRef = {
  vaultAssetId: string;
  role?: string;
  label?: string;
};

/**
 * Controlled platform vocabulary from M1 staticRoutes labels.
 * Not separate artifact types — config choice values.
 */
export const SOCIAL_MEDIA_PLATFORMS = [
  "instagram",
  "facebook",
  "linkedin",
  "x",
  "other",
] as const;

export type SocialMediaPlatform = (typeof SOCIAL_MEDIA_PLATFORMS)[number];

// ─── social-media.platform ─────────────────────────────────────────────────

export type SocialMediaPlatformData = {
  schemaId: string;
  /** Stable choice id, e.g. platform_instagram */
  platformId: string;
  platform: SocialMediaPlatform;
  /** Display label as shown in UI (Instagram, X, …). */
  label?: string;
  notes?: string;
  sourceRefs?: SocialMediaSourceRefs;
};

// ─── social-media.size-reference ───────────────────────────────────────────

/**
 * Size / Reference path from M1 staticRoutes:
 * Enter Size | Use Platform Size | Upload Reference | Skip
 */
export type SocialMediaSizePathKind =
  | "enter_size"
  | "use_platform_size"
  | "upload_reference"
  | "skip";

export type SocialMediaSizeReferenceData = {
  schemaId: string;
  /** Stable option id, e.g. size_option_enter */
  optionId: string;
  pathKind: SocialMediaSizePathKind;
  /** Exact pixel canvas when known (enter_size / resolved platform default). */
  canvas?: SocialMediaPixelCanvas;
  /** Vault refs for uploaded reference creatives. */
  referenceAssetRefs?: SocialMediaPreviewAssetRef[];
  platformRef?: SocialMediaExactArtifactRef;
  /**
   * Placement/format ids from onboarding (feed-post, stories, …) are optional
   * metadata — not CDF artifact types. Free-form until a closed enum is proven.
   */
  formatHint?: string;
  notes?: string;
  sourceRefs?: SocialMediaSourceRefs;
};

// ─── social-media.routes (creative directions) ─────────────────────────────

/**
 * Route card fields aligned with M1 textLines:
 * Direction name, visual treatment, headline/message angle, why it fits,
 * plus optional production-actionable semantics for downstream generation.
 */
export type SocialMediaDesignRoute = {
  routeId: string;
  name: string;
  creativeIdea?: string;
  visualTreatment?: string;
  headlineAngle?: string;
  rationale?: string;
  visualCharacteristics?: string[];
  /** What the creative must communicate. */
  communicationObjective?: string;
  primaryMessage?: string;
  secondaryMessage?: string;
  visualConcept?: string;
  focalPoint?: string;
  composition?: string;
  hierarchy?: string;
  typographyDirection?: string;
  supportingVisualElements?: string;
  brandIntegration?: string;
  /** How the identity mark participates (secondary lockup, corner mark, …). */
  identityMarkRole?: string;
  audienceSignal?: string;
  /** Intended medium / use context (feed post, story, OOH, …) — not a platform enum. */
  useContextIntent?: string;
  avoidances?: string;
};

/**
 * Candidate set for the routes phase (exactly 3 in M1 cardinality).
 * Selection of a route is M3A lifecycle + selectedRouteId — not "displayed".
 */
export type SocialMediaRoutesData = {
  schemaId: string;
  routes: SocialMediaDesignRoute[];
  /**
   * Set only when user explicitly selects a route (backend authoritative).
   * Must reference an existing routes[].routeId. Absent ≠ selected.
   */
  selectedRouteId?: string;
  platformRef?: SocialMediaExactArtifactRef;
  sizeReferenceRef?: SocialMediaExactArtifactRef;
  sourceRefs?: SocialMediaSourceRefs;
};

// ─── social-media.output (single image creative) ───────────────────────────

/**
 * On-image copy is part of the visual creative (refine: "Give me another headline").
 * Native post caption / hashtags are a SEPARATE deliverable outside this CDF path
 * (hygiene + social/copywriting subtype) — mark unresolved when absent.
 */
export type SocialMediaOnImageCopy = {
  headline?: string;
  messageAngle?: string;
  /**
   * Distinguish user-provided exact copy from AI-generated inference.
   * Absent provenance ⇒ treat as generative / unknown.
   */
  provenance?: "user_provided" | "ai_generated" | "mixed" | "unknown";
};

/**
 * Single social creative (M1: artifactType image, cardinality single).
 * A lone image URL / art_* id is NOT sufficient canonical state.
 */
export type SocialMediaOutputData = {
  schemaId: string;
  /** Stable creative id, e.g. creative_01 */
  creativeId: string;
  routesRef: SocialMediaExactArtifactRef;
  /** Optional exact pins for earlier config (phase chain platform → size → routes). */
  platformRef?: SocialMediaExactArtifactRef;
  sizeReferenceRef?: SocialMediaExactArtifactRef;
  canvas?: SocialMediaPixelCanvas;
  onImageCopy?: SocialMediaOnImageCopy;
  compositionNotes?: string;
  previewAssetRef?: SocialMediaPreviewAssetRef;
  /**
   * Explicit: native caption / hashtag / alt-text post body is NOT modeled
   * as this artifact. When true, consumers must not assume caption fields.
   */
  captionUnresolved?: true;
  /**
   * Explicit: carousel / multi-frame / reel / story timeline is NOT this artifact.
   * CDF output is a single image creative.
   */
  multiAssetUnresolved?: true;
  sourceRefs?: SocialMediaSourceRefs;
};
