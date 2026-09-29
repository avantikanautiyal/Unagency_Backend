/**
 * Identity helpers — RenderedFile ≠ Artifact ≠ Vault ≠ execution ≠ media art_*.
 */

import { createHash } from "crypto";
import {
  assertCdfArtifactId,
  isExecutionIdShape,
  isMediaArtifactIdShape,
  isVaultAssetObjectIdShape,
} from "../artifacts/ids";

const RENDERED_FILE_PREFIX = "cdfrndf_";

let seq = 0;

export function resetCdfRenderedFileIdsForTests(): void {
  seq = 0;
}

export function isCdfRenderedFileId(id: string): boolean {
  return id.startsWith(RENDERED_FILE_PREFIX);
}

export function assertRenderedFileIdBoundaries(id: string, label = "fileId"): void {
  if (isVaultAssetObjectIdShape(id)) {
    throw new Error(`${label} must not be a Vault ObjectId. Got: ${id}`);
  }
  if (isExecutionIdShape(id)) {
    throw new Error(`${label} must not be an execution ID. Got: ${id}`);
  }
  if (isMediaArtifactIdShape(id)) {
    throw new Error(`${label} must not be a media art_* ID. Got: ${id}`);
  }
  if (id.startsWith("cdfart_")) {
    throw new Error(`${label} must not be a canonical artifact ID. Got: ${id}`);
  }
}

export function createCdfRenderedFileId(format: string): string {
  seq += 1;
  const slug = format.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 16);
  return `${RENDERED_FILE_PREFIX}${Date.now().toString(36)}_${seq.toString(36)}_${slug}`;
}

export function assertRenderTargetArtifactId(artifactId: string): void {
  assertCdfArtifactId(artifactId);
}

export function sha256Hex(bytes: Uint8Array | Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function buildTenantRenderStorageKey(input: {
  organizationId: string;
  artifactId: string;
  artifactVersion: number;
  renderKey: string;
}): string {
  return `tenant/${input.organizationId}/cdf-renders/${input.artifactId}/v${input.artifactVersion}/${input.renderKey}`;
}
