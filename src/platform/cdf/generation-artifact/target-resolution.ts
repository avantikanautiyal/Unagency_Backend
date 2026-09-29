/**
 * Resolve which canonical artifact a generation completion targets (M3C / M8A / M9A).
 * Authoritative source: CDF phase contract — never AI output text.
 *
 * Class-A deep overlays (presentation / packaging / social-media) remain preferred
 * when their key maps resolve. All other services resolve from phase.artifact →
 * builtin type-level schemas (contract-generic completion).
 */

import { resolveCdfCanonicalService } from "../canonical";
import {
  PRESENTATION_ARTIFACT_KEYS,
  PRESENTATION_ARTIFACT_TYPE_BY_KEY,
  PRESENTATION_SCHEMA_VERSION,
  presentationSchemaId,
  type PresentationArtifactKey,
} from "../artifacts/presentation/keys";
import {
  PACKAGING_ARTIFACT_TYPE_BY_KEY,
  PACKAGING_KEY_ALIASES,
  PACKAGING_PHASE_ARTIFACT_KEY,
  PACKAGING_SCHEMA_VERSION,
  packagingSchemaId,
  type PackagingArtifactKey,
} from "../artifacts/packaging/keys";
import {
  SOCIAL_MEDIA_ARTIFACT_TYPE_BY_KEY,
  SOCIAL_MEDIA_KEY_ALIASES,
  SOCIAL_MEDIA_PHASE_ARTIFACT_KEY,
  SOCIAL_MEDIA_SCHEMA_VERSION,
  socialMediaSchemaId,
  type SocialMediaArtifactKey,
} from "../artifacts/social-media/keys";
import type { CdfArtifactType } from "../artifacts/types";
import { generationArtifactError } from "./errors";
import type { ArtifactTargetResolution } from "./types";

/** Map M1 phase artifact keys / families onto M3B presentation keys. */
export const PRESENTATION_KEY_ALIASES: Record<string, PresentationArtifactKey> = {
  "presentation.source": PRESENTATION_ARTIFACT_KEYS.source,
  "presentation.storyline": PRESENTATION_ARTIFACT_KEYS.storyline,
  "presentation.slide-content": PRESENTATION_ARTIFACT_KEYS.slideContent,
  "presentation.design-route": PRESENTATION_ARTIFACT_KEYS.designRoute,
  "presentation.design-route-options": PRESENTATION_ARTIFACT_KEYS.designRoute,
  "presentation.design-system": PRESENTATION_ARTIFACT_KEYS.designSystem,
  "presentation.deck": PRESENTATION_ARTIFACT_KEYS.deck,
  "presentation.refinement": PRESENTATION_ARTIFACT_KEYS.deck,
  "presentation.final": PRESENTATION_ARTIFACT_KEYS.deck,
};

export const PRESENTATION_PHASE_FALLBACK: Record<string, PresentationArtifactKey> = {
  source: PRESENTATION_ARTIFACT_KEYS.source,
  storyline: PRESENTATION_ARTIFACT_KEYS.storyline,
  "slide-content": PRESENTATION_ARTIFACT_KEYS.slideContent,
  "design-routes": PRESENTATION_ARTIFACT_KEYS.designRoute,
  select: PRESENTATION_ARTIFACT_KEYS.designSystem,
  "full-deck": PRESENTATION_ARTIFACT_KEYS.deck,
  "slide-refinement": PRESENTATION_ARTIFACT_KEYS.deck,
};

const GENERIC_SCHEMA_VERSION = "1";

function buildGenericResolution(
  serviceId: string,
  phaseId: string,
  artifactKey: string,
  artifactType: CdfArtifactType,
): ArtifactTargetResolution {
  return {
    serviceId,
    phaseId,
    artifactKey,
    artifactType,
    schemaVersion: GENERIC_SCHEMA_VERSION,
    schemaId: `unagency.cdf.generic.${artifactType}.v${GENERIC_SCHEMA_VERSION}`,
  };
}

function tryGenericFromPhase(input: {
  serviceId: string;
  phaseId: string;
  artifactKeyOverride?: string;
}): ArtifactTargetResolution | null {
  const canonical = resolveCdfCanonicalService(input.serviceId);
  if (!canonical) return null;
  const phase = canonical.phases.find((p) => p.phaseId === input.phaseId);
  if (!phase?.artifact?.artifactKey || !phase.artifact.artifactType) return null;
  if (
    input.artifactKeyOverride &&
    input.artifactKeyOverride !== phase.artifact.artifactKey
  ) {
    // Override must match the phase contract key for generic resolution.
    // (Class-A aliases are handled before this path.)
    return null;
  }
  return buildGenericResolution(
    canonical.serviceId,
    phase.phaseId,
    phase.artifact.artifactKey,
    phase.artifact.artifactType as CdfArtifactType,
  );
}

export function resolveArtifactTarget(input: {
  serviceId: string;
  phaseId: string;
  artifactKeyOverride?: string;
}): ArtifactTargetResolution {
  if (input.artifactKeyOverride) {
    const packMapped = PACKAGING_KEY_ALIASES[input.artifactKeyOverride];
    if (packMapped) {
      return buildPackagingResolution(input.serviceId, input.phaseId, packMapped);
    }
    const socialMapped = SOCIAL_MEDIA_KEY_ALIASES[input.artifactKeyOverride];
    if (socialMapped) {
      return buildSocialMediaResolution(
        input.serviceId,
        input.phaseId,
        socialMapped,
      );
    }
    const mapped = PRESENTATION_KEY_ALIASES[input.artifactKeyOverride];
    if (mapped) {
      return buildPresentationResolution(input.serviceId, input.phaseId, mapped);
    }
    const generic = tryGenericFromPhase(input);
    if (generic) return generic;
    throw generationArtifactError(
      "ARTIFACT_TARGET_UNRESOLVED",
      `Unknown artifact key override: ${input.artifactKeyOverride}`,
      { artifactKey: input.artifactKeyOverride },
    );
  }

  const canonical = resolveCdfCanonicalService(input.serviceId);
  if (!canonical) {
    throw generationArtifactError(
      "ARTIFACT_TARGET_UNRESOLVED",
      `Unknown service: ${input.serviceId}`,
      { serviceId: input.serviceId },
    );
  }

  const phase = canonical.phases.find((p) => p.phaseId === input.phaseId);
  if (!phase) {
    throw generationArtifactError(
      "ARTIFACT_TARGET_UNRESOLVED",
      `Unknown phase "${input.phaseId}" for service "${input.serviceId}"`,
      { serviceId: input.serviceId, phaseId: input.phaseId },
    );
  }

  if (canonical.serviceId === "packaging") {
    const fromPhase = PACKAGING_PHASE_ARTIFACT_KEY[input.phaseId];
    const fromKey = phase.artifact?.artifactKey
      ? PACKAGING_KEY_ALIASES[phase.artifact.artifactKey]
      : undefined;
    const artifactKey = fromPhase ?? fromKey;
    if (artifactKey) {
      return buildPackagingResolution(input.serviceId, input.phaseId, artifactKey);
    }
    // Final / download-only packaging phases fall through only if phase has no map.
    throw generationArtifactError(
      "ARTIFACT_TARGET_UNRESOLVED",
      `Phase "${input.phaseId}" has no Packaging creative artifact mapping (final is download-only)`,
      { serviceId: input.serviceId, phaseId: input.phaseId },
    );
  }

  if (canonical.serviceId === "social-media") {
    const fromPhase = SOCIAL_MEDIA_PHASE_ARTIFACT_KEY[input.phaseId];
    const fromKey = phase.artifact?.artifactKey
      ? SOCIAL_MEDIA_KEY_ALIASES[phase.artifact.artifactKey]
      : undefined;
    const artifactKey = fromPhase ?? fromKey;
    if (artifactKey) {
      return buildSocialMediaResolution(
        input.serviceId,
        input.phaseId,
        artifactKey,
      );
    }
    throw generationArtifactError(
      "ARTIFACT_TARGET_UNRESOLVED",
      `Phase "${input.phaseId}" has no Social Media creative artifact mapping (final is download-only)`,
      { serviceId: input.serviceId, phaseId: input.phaseId },
    );
  }

  if (canonical.serviceId === "presentation") {
    const fromFamily = phase.presentationArtifactFamily
      ? PRESENTATION_KEY_ALIASES[phase.presentationArtifactFamily]
      : undefined;
    const fromKey = phase.artifact?.artifactKey
      ? PRESENTATION_KEY_ALIASES[phase.artifact.artifactKey]
      : undefined;
    const fromPhase = PRESENTATION_PHASE_FALLBACK[input.phaseId];
    const artifactKey = fromFamily ?? fromKey ?? fromPhase;
    if (!artifactKey) {
      throw generationArtifactError(
        "ARTIFACT_TARGET_UNRESOLVED",
        `Phase "${input.phaseId}" has no Presentation artifact mapping`,
        { serviceId: input.serviceId, phaseId: input.phaseId },
      );
    }
    return buildPresentationResolution(input.serviceId, input.phaseId, artifactKey);
  }

  // All other services: contract-generic target from phase.artifact.
  const generic = tryGenericFromPhase({
    serviceId: input.serviceId,
    phaseId: input.phaseId,
  });
  if (generic) return generic;

  throw generationArtifactError(
    "ARTIFACT_TARGET_UNRESOLVED",
    `Phase "${input.phaseId}" has no artifact contract for service "${input.serviceId}"`,
    { serviceId: input.serviceId, phaseId: input.phaseId },
  );
}

function buildPresentationResolution(
  serviceId: string,
  phaseId: string,
  artifactKey: PresentationArtifactKey,
): ArtifactTargetResolution {
  const artifactType = PRESENTATION_ARTIFACT_TYPE_BY_KEY[
    artifactKey
  ] as CdfArtifactType;
  return {
    serviceId,
    phaseId,
    artifactKey,
    artifactType,
    schemaVersion: PRESENTATION_SCHEMA_VERSION,
    schemaId: presentationSchemaId(artifactKey),
  };
}

function buildPackagingResolution(
  serviceId: string,
  phaseId: string,
  artifactKey: PackagingArtifactKey,
): ArtifactTargetResolution {
  const artifactType = PACKAGING_ARTIFACT_TYPE_BY_KEY[
    artifactKey
  ] as CdfArtifactType;
  return {
    serviceId,
    phaseId,
    artifactKey,
    artifactType,
    schemaVersion: PACKAGING_SCHEMA_VERSION,
    schemaId: packagingSchemaId(artifactKey),
  };
}

function buildSocialMediaResolution(
  serviceId: string,
  phaseId: string,
  artifactKey: SocialMediaArtifactKey,
): ArtifactTargetResolution {
  const artifactType = SOCIAL_MEDIA_ARTIFACT_TYPE_BY_KEY[
    artifactKey
  ] as CdfArtifactType;
  return {
    serviceId,
    phaseId,
    artifactKey,
    artifactType,
    schemaVersion: SOCIAL_MEDIA_SCHEMA_VERSION,
    schemaId: socialMediaSchemaId(artifactKey),
  };
}
