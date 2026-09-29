/**
 * Social Media artifact keys (M9A) — aligned with M1 CDF registry phase artifactKeys.
 *
 * M1 emits `${serviceId}.${phaseId}` for social-media:
 *   social-media.platform | social-media.size-reference |
 *   social-media.routes | social-media.output | social-media.final
 *
 * Vocabulary decisions (forensic):
 * - Prefer social-media.* (not social.*) to match M1 without registry churn.
 *   Alias social.* → social-media.* for adapter/target resolution only.
 * - No social-media.source — brief lives in ActiveBrief / Requirement Engine.
 * - No social-media.carousel / story / reel / caption as CDF phases —
 *   those exist in onboarding/production-spec taxonomy, not the CDF phase graph.
 * - social-media.final is a download/adaptation boundary, not a creative schema.
 */

export const SOCIAL_MEDIA_ARTIFACT_KEYS = {
  platform: "social-media.platform",
  sizeReference: "social-media.size-reference",
  routes: "social-media.routes",
  output: "social-media.output",
} as const;

export type SocialMediaArtifactKey =
  (typeof SOCIAL_MEDIA_ARTIFACT_KEYS)[keyof typeof SOCIAL_MEDIA_ARTIFACT_KEYS];

/** M1 CdfArtifactType mapping for each social-media key. */
export const SOCIAL_MEDIA_ARTIFACT_TYPE_BY_KEY = {
  "social-media.platform": "config_choice",
  "social-media.size-reference": "config_choice",
  "social-media.routes": "text_choice",
  "social-media.output": "image",
} as const satisfies Record<SocialMediaArtifactKey, string>;

export const SOCIAL_MEDIA_SCHEMA_VERSION = "1";

/** Alias → canonical key (never scatter alias strings in controllers). */
export const SOCIAL_MEDIA_KEY_ALIASES: Record<string, SocialMediaArtifactKey> = {
  "social-media.platform": SOCIAL_MEDIA_ARTIFACT_KEYS.platform,
  "social.platform": SOCIAL_MEDIA_ARTIFACT_KEYS.platform,
  "social-media.size-reference": SOCIAL_MEDIA_ARTIFACT_KEYS.sizeReference,
  "social-media.size_reference": SOCIAL_MEDIA_ARTIFACT_KEYS.sizeReference,
  "social.size-reference": SOCIAL_MEDIA_ARTIFACT_KEYS.sizeReference,
  "social.size_reference": SOCIAL_MEDIA_ARTIFACT_KEYS.sizeReference,
  "social-media.routes": SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
  "social.routes": SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
  "social-media.output": SOCIAL_MEDIA_ARTIFACT_KEYS.output,
  "social.output": SOCIAL_MEDIA_ARTIFACT_KEYS.output,
  "social-media.creative": SOCIAL_MEDIA_ARTIFACT_KEYS.output,
  "social.creative": SOCIAL_MEDIA_ARTIFACT_KEYS.output,
};

/** Phase id → canonical social-media artifact key (final has no creative schema). */
export const SOCIAL_MEDIA_PHASE_ARTIFACT_KEY: Record<
  string,
  SocialMediaArtifactKey | null
> = {
  platform: SOCIAL_MEDIA_ARTIFACT_KEYS.platform,
  "size-reference": SOCIAL_MEDIA_ARTIFACT_KEYS.sizeReference,
  routes: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
  output: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
  final: null,
};

export function socialMediaSchemaId(
  key: SocialMediaArtifactKey,
  version: string = SOCIAL_MEDIA_SCHEMA_VERSION,
): string {
  const short = key.replace(/^social-media\./, "").replace(/-/g, "_");
  return `unagency.social_media.${short}.v${version}`;
}

export function isSocialMediaArtifactKey(
  key: string,
): key is SocialMediaArtifactKey {
  return (Object.values(SOCIAL_MEDIA_ARTIFACT_KEYS) as string[]).includes(key);
}

export function resolveSocialMediaArtifactKey(
  keyOrAlias: string,
): SocialMediaArtifactKey | undefined {
  return SOCIAL_MEDIA_KEY_ALIASES[keyOrAlias];
}
