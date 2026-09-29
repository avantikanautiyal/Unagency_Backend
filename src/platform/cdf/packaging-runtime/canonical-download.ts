/**
 * M8F — Resolve Packaging canonical download → RenderedFile (exact version).
 * Never calls AI. Never invents formats. Never silent art_* fallback.
 */

import { getArtifactVersion } from "../artifacts";
import { CdfArtifactError } from "../artifacts/errors";
import { renderArtifact, type RenderArtifactDeps } from "../rendering/service";
import type { CdfRenderedFile } from "../rendering/types";
import { renderError } from "../rendering/errors";
import {
  evaluatePackagingDownloadEligibility,
  type PackagingCanonicalPin,
  type PackagingDownloadEligibility,
} from "./download-eligibility";

export type ResolvePackagingCanonicalDownloadInput = {
  label: string;
  format?: "png" | "jpg" | string | null;
  pin: PackagingCanonicalPin;
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

export type ResolvePackagingCanonicalDownloadResult =
  | {
      kind: "rendered";
      eligibility: Extract<
        PackagingDownloadEligibility,
        { decision: "canonical_capable" }
      >;
      file: CdfRenderedFile;
      downloadPath: string;
    }
  | {
      kind: "not_canonical";
      eligibility: Exclude<
        PackagingDownloadEligibility,
        { decision: "canonical_capable" }
      >;
    };

/**
 * Attempt canonical Packaging download.
 * Caller must treat unsupported_representation as hard failure (no art_*).
 */
export async function resolvePackagingCanonicalDownload(
  input: ResolvePackagingCanonicalDownloadInput,
): Promise<ResolvePackagingCanonicalDownloadResult> {
  const eligibility = evaluatePackagingDownloadEligibility({
    label: input.label,
    format: input.format,
    pin: input.pin,
    canonicalDownloadEnabled: input.canonicalDownloadEnabled,
  });

  if (eligibility.decision !== "canonical_capable") {
    return { kind: "not_canonical", eligibility };
  }

  // Exact version load — prove pin exists before render
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

  const file = await renderArtifact(
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

  return {
    kind: "rendered",
    eligibility,
    file,
    downloadPath: `/v1/cdf/rendered-files/${file.fileId}/content`,
  };
}
