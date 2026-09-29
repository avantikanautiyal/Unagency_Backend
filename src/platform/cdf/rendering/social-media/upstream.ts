/**
 * M9E — Assert Social Media exact upstream refs resolve (never latest).
 */

import { getArtifactVersion } from "../../artifacts";
import { CdfArtifactError } from "../../artifacts/errors";
import { SOCIAL_MEDIA_ARTIFACT_KEYS } from "../../artifacts/social-media/keys";
import { renderError } from "../errors";

type ExactRef = { artifactId?: string; version?: number; artifactKey?: string };

function assertExactRef(
  label: string,
  ref: ExactRef | undefined,
  ownership: { organizationId?: string; projectId?: string },
  required: boolean,
): void {
  if (!ref) {
    if (!required) return;
    throw renderError(
      "ARTIFACT_NOT_RENDERABLE",
      `Social Media missing exact upstream ref: ${label}`,
    );
  }
  if (!ref.artifactId || ref.version == null || !Number.isInteger(ref.version)) {
    throw renderError(
      "ARTIFACT_NOT_RENDERABLE",
      `Social Media upstream ${label} must be exact artifactId+version (never latest)`,
      { ref },
    );
  }
  try {
    getArtifactVersion(ref.artifactId, ref.version, ownership);
  } catch (err) {
    if (err instanceof CdfArtifactError) {
      if (err.artifactCode === "ARTIFACT_OWNERSHIP_INVALID") {
        throw renderError(
          "ARTIFACT_OWNERSHIP_INVALID",
          `Cross-tenant Social Media dependency refused: ${label}`,
          { artifactId: ref.artifactId, version: ref.version },
        );
      }
      throw renderError(
        "ARTIFACT_NOT_FOUND",
        `Social Media upstream ${label} ${ref.artifactId}@v${ref.version} not found`,
        { artifactId: ref.artifactId, version: ref.version },
      );
    }
    throw err;
  }
}

/** Verify exact upstream pins when present on Social Media output payloads. */
export function assertSocialMediaUpstreamExactRefs(
  artifactKey: string,
  data: Record<string, unknown>,
  ownership: { organizationId?: string; projectId?: string },
): void {
  if (artifactKey !== SOCIAL_MEDIA_ARTIFACT_KEYS.output) return;

  assertExactRef("routesRef", data.routesRef as ExactRef, ownership, true);
  if (data.platformRef) {
    assertExactRef("platformRef", data.platformRef as ExactRef, ownership, false);
  }
  if (data.sizeReferenceRef) {
    assertExactRef(
      "sizeReferenceRef",
      data.sizeReferenceRef as ExactRef,
      ownership,
      false,
    );
  }
}
