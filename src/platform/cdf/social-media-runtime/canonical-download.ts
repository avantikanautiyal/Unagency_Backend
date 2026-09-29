/**
 * M9F — Resolve Social Media canonical download → RenderedFile (exact version).
 * Never calls AI. Never invents formats. Never silent art_* fallback.
 */

import { getArtifactVersion } from "../artifacts";
import { CdfArtifactError } from "../artifacts/errors";
import { renderArtifact, type RenderArtifactDeps } from "../rendering/service";
import type { CdfRenderedFile } from "../rendering/types";
import { renderError } from "../rendering/errors";
import {
  evaluateSocialMediaDownloadEligibility,
  type SocialMediaCanonicalPin,
  type SocialMediaDownloadEligibility,
} from "./download-eligibility";

export type ResolveSocialMediaCanonicalDownloadInput = {
  label: string;
  format?: "png" | "jpg" | string | null;
  pin: SocialMediaCanonicalPin;
  organizationId?: string;
  workspaceId?: string;
  projectId?: string;
  requestId?: string;
  options?: {
    extras?: Record<string, string | number | boolean | null>;
  };
  canonicalDownloadEnabled?: boolean;
  deps?: RenderArtifactDeps;
};

export type ResolveSocialMediaCanonicalDownloadResult =
  | {
      kind: "rendered";
      eligibility: Extract<
        SocialMediaDownloadEligibility,
        { decision: "canonical_capable" }
      >;
      file: CdfRenderedFile;
      downloadPath: string;
    }
  | {
      kind: "not_canonical";
      eligibility: Exclude<
        SocialMediaDownloadEligibility,
        { decision: "canonical_capable" }
      >;
    };

/**
 * Attempt canonical Social Media download.
 * Caller must treat unsupported_representation / lifecycle_blocked as hard failure (no art_*).
 */
export async function resolveSocialMediaCanonicalDownload(
  input: ResolveSocialMediaCanonicalDownloadInput,
): Promise<ResolveSocialMediaCanonicalDownloadResult> {
  // Exact version load first — enrich pin with lifecycle for M9C approved-only final.
  let lifecycleStatus: string | undefined = input.pin.lifecycleStatus;
  try {
    const versionRecord = getArtifactVersion(
      input.pin.artifactId,
      input.pin.artifactVersion,
      {
        organizationId: input.organizationId,
        projectId: input.projectId,
      },
    );
    lifecycleStatus = versionRecord.status;
  } catch (err) {
    if (err instanceof CdfArtifactError) {
      // Missing / ownership — eligibility may still classify; rethrow after evaluate
      // only when we would have been canonical_capable.
    } else {
      throw err;
    }
  }

  const eligibility = evaluateSocialMediaDownloadEligibility({
    label: input.label,
    format: input.format,
    pin: {
      ...input.pin,
      ...(lifecycleStatus ? { lifecycleStatus } : {}),
    },
    canonicalDownloadEnabled: input.canonicalDownloadEnabled,
  });

  console.info(
    JSON.stringify({
      scope: "cdf.social_media_runtime",
      event: "download_eligibility",
      service: "social-media",
      cta: eligibility.decision === "not_a_download" ? eligibility.cta : (eligibility as { cta?: string }).cta,
      decision: eligibility.decision,
      artifactId:
        "artifactId" in eligibility ? eligibility.artifactId : undefined,
      artifactVersion:
        "artifactVersion" in eligibility
          ? eligibility.artifactVersion
          : undefined,
      format: "format" in eligibility ? eligibility.format : input.format,
      reason: eligibility.reason,
      flagCanonicalDownload: input.canonicalDownloadEnabled,
      ts: new Date().toISOString(),
    }),
  );

  if (eligibility.decision !== "canonical_capable") {
    return { kind: "not_canonical", eligibility };
  }

  try {
    getArtifactVersion(eligibility.artifactId, eligibility.artifactVersion, {
      organizationId: input.organizationId,
      projectId: input.projectId,
    });
  } catch (err) {
    if (err instanceof CdfArtifactError) {
      throw renderError(
        err.artifactCode === "ARTIFACT_OWNERSHIP_INVALID"
          ? "ARTIFACT_OWNERSHIP_INVALID"
          : "ARTIFACT_NOT_FOUND",
        err.message,
      );
    }
    throw err;
  }

  let file: CdfRenderedFile;
  try {
    file = await renderArtifact(
      {
        artifactId: eligibility.artifactId,
        artifactVersion: eligibility.artifactVersion,
        artifactKey: eligibility.artifactKey,
        format: eligibility.format,
        purpose: eligibility.purpose,
        options: input.options,
        requestId: input.requestId,
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        projectId: input.projectId,
      },
      input.deps,
    );
  } catch (err) {
    console.info(
      JSON.stringify({
        scope: "cdf.social_media_runtime",
        event: "canonical_render_failed",
        service: "social-media",
        artifactId: eligibility.artifactId,
        artifactVersion: eligibility.artifactVersion,
        format: eligibility.format,
        rendererId: "social-media-preview-raster",
        error: err instanceof Error ? err.message : String(err),
        silentLegacyFallbackForbidden: true,
        ts: new Date().toISOString(),
      }),
    );
    throw err;
  }

  console.info(
    JSON.stringify({
      scope: "cdf.social_media_runtime",
      event: "canonical_download_success",
      service: "social-media",
      artifactId: file.artifactId,
      artifactVersion: file.artifactVersion,
      format: file.format,
      fileId: file.fileId,
      rendererId: file.rendererId,
      rendererVersion: file.rendererVersion,
      checksum: file.checksum,
      decision: "canonical_capable",
      ts: new Date().toISOString(),
    }),
  );

  return {
    kind: "rendered",
    eligibility,
    file,
    downloadPath: `/v1/cdf/rendered-files/${file.fileId}/content`,
  };
}
