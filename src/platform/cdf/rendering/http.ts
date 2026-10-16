/**
 * HTTP helpers for canonical CDF render/download (M5B).
 * Does NOT invoke document-export-materializer or any AI path.
 */

import { getArtifact, getArtifactVersion } from "../artifacts";
import { extractVaultAssetIdFromArtifactData } from "../generation-context/canonical-visual-bytes";
import { renderError } from "./errors";
import { isCdfRenderedFileId } from "./ids";
import { renderArtifact, type RenderArtifactDeps } from "./service";
import {
  getRenderedBlob,
  getRenderedBlobAsync,
  getRenderedFile,
} from "./storage";
import type {
  CdfRenderFormat,
  CdfRenderOptions,
  CdfRenderPurpose,
  CdfRenderedFile,
} from "./types";
import { PRESENTATION_ARTIFACT_KEYS } from "../artifacts/presentation/keys";

export type HttpRenderBody = {
  format: CdfRenderFormat;
  purpose?: CdfRenderPurpose;
  options?: CdfRenderOptions;
  rendererVersion?: string;
  requestId?: string;
  artifactKey?: string;
};

export async function httpRenderArtifact(input: {
  artifactId: string;
  artifactVersion: number;
  body: HttpRenderBody;
  organizationId?: string;
  workspaceId?: string;
  projectId?: string;
  deps?: RenderArtifactDeps;
}): Promise<CdfRenderedFile> {
  const { ensureCdfArtifactBagLoaded } = await import("../artifacts/store");
  await ensureCdfArtifactBagLoaded();

  const head = getArtifact(input.artifactId, {
    organizationId: input.organizationId,
    projectId: input.projectId,
  });
  return renderArtifact(
    {
      artifactId: input.artifactId,
      artifactVersion: input.artifactVersion,
      artifactKey: input.body.artifactKey ?? head.artifactKey,
      format: input.body.format,
      purpose: input.body.purpose ?? "final",
      options: input.body.options,
      rendererVersion: input.body.rendererVersion,
      requestId: input.body.requestId,
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      projectId: input.projectId ?? head.projectId,
    },
    input.deps,
  );
}

export function httpGetRenderedFile(input: {
  fileId: string;
  organizationId?: string;
  projectId?: string;
}): CdfRenderedFile {
  if (!isCdfRenderedFileId(input.fileId)) {
    throw renderError(
      "RENDER_REQUEST_INVALID",
      `Invalid rendered file id: ${input.fileId}`,
    );
  }
  const file = getRenderedFile(input.fileId);
  if (!file) {
    throw renderError("ARTIFACT_NOT_FOUND", `RenderedFile not found: ${input.fileId}`);
  }
  if (
    input.organizationId &&
    file.organizationId &&
    file.organizationId !== input.organizationId
  ) {
    throw renderError(
      "ARTIFACT_OWNERSHIP_INVALID",
      "RenderedFile does not belong to this organization",
    );
  }
  if (
    input.projectId &&
    file.projectId &&
    file.projectId !== input.projectId
  ) {
    throw renderError(
      "ARTIFACT_OWNERSHIP_INVALID",
      "RenderedFile does not belong to this project",
    );
  }
  return file;
}

export async function httpGetRenderedFileBytes(input: {
  fileId: string;
  organizationId?: string;
  projectId?: string;
}): Promise<{ file: CdfRenderedFile; bytes: Uint8Array }> {
  const file = httpGetRenderedFile(input);
  const blob =
    getRenderedBlob(file.storageKey) ??
    (await getRenderedBlobAsync(file.storageKey));
  if (!blob) {
    throw renderError("STORAGE_FAILED", `Bytes missing for ${file.fileId}`);
  }
  return { file, bytes: blob.bytes };
}

/**
 * Exact Brand Vault media of one image/video ArtifactVersion. Final downloads
 * of an approved visual must fetch this exact version — never "the first
 * image" of the execution that produced it (a route set holds several).
 */
export async function httpGetArtifactVersionMedia(input: {
  artifactId: string;
  artifactVersion: number;
  organizationId?: string;
  projectId?: string;
}): Promise<{
  artifactId: string;
  artifactVersion: number;
  artifactKey: string;
  artifactType: string;
  vaultAssetId: string;
}> {
  const { ensureCdfArtifactBagLoaded } = await import("../artifacts/store");
  await ensureCdfArtifactBagLoaded();
  if (!Number.isInteger(input.artifactVersion) || input.artifactVersion < 1) {
    throw renderError(
      "RENDER_REQUEST_INVALID",
      `Invalid artifact version: ${String(input.artifactVersion)}`,
    );
  }
  const ownership = {
    organizationId: input.organizationId,
    projectId: input.projectId,
  };
  const head = getArtifact(input.artifactId, ownership);
  const version = getArtifactVersion(
    input.artifactId,
    input.artifactVersion,
    ownership,
  );
  const vaultAssetId = extractVaultAssetIdFromArtifactData(version.data);
  if (!vaultAssetId) {
    throw renderError(
      "ASSET_NOT_FOUND",
      `No stored media for ${input.artifactId}@${input.artifactVersion}`,
    );
  }
  return {
    artifactId: input.artifactId,
    artifactVersion: input.artifactVersion,
    artifactKey: head.artifactKey,
    artifactType: String(head.artifactType),
    vaultAssetId,
  };
}

/** FE compatibility note — legacy still uses art_* media IDs. */
export const CDF_RENDER_FE_COMPAT = {
  legacyFields: ["pdfArtifactId", "pptxArtifactId"] as const,
  legacyPath: "GET /v1/artifacts/:artifactId/media (art_*)",
  canonical: {
    render:
      "POST /v1/cdf/artifacts/:artifactId/versions/:version/render",
    meta: "GET /v1/cdf/rendered-files/:fileId",
    content: "GET /v1/cdf/rendered-files/:fileId/content",
    ids: "cdfrndf_* (not art_*, not cdfart_*)",
  },
  defaultArtifactKey: PRESENTATION_ARTIFACT_KEYS.deck,
} as const;
