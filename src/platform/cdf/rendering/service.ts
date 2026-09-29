/**
 * M5 — Render a specific canonical artifact version into a RenderedFile.
 *
 * Pure representation path: no AI, no Requirement Engine, no Context Resolver,
 * no creative mutation, no new artifact versions.
 */

import {
  getArtifact,
  getArtifactVersion,
} from "../artifacts";
import { CdfArtifactError } from "../artifacts/errors";
import {
  collectVaultAssetIdsFromDeckData,
  resolveAssetsForRender,
  type VaultAssetResolver,
} from "./asset-resolver";
import { getDefaultVaultAssetResolver } from "./default-vault-asset-resolver";
import {
  selectPackagingPreviewVaultId,
} from "./packaging/asset-collect";
import { assertPackagingUpstreamExactRefs } from "./packaging/upstream";
import { selectSocialMediaPreviewVaultId } from "./social-media/asset-collect";
import { assertSocialMediaUpstreamExactRefs } from "./social-media/upstream";
import { putRenderedBlobToBackend } from "./blob-backend";
import { renderError } from "./errors";
import { computeRenderKey, hashRenderOptions } from "./hash";
import {
  assertRenderTargetArtifactId,
  buildTenantRenderStorageKey,
  createCdfRenderedFileId,
  sha256Hex,
} from "./ids";
import { assertLifecycleAllowsRender } from "./lifecycle-gate";
import { normalizeRenderOptions } from "./options";
import { resolveRenderer } from "./registry";
import {
  getRenderedFileByRenderKey,
  putRenderedBlob,
  saveRenderedFile,
} from "./storage";
import type {
  CdfRenderRequest,
  CdfRenderedFile,
} from "./types";
import { PRESENTATION_ARTIFACT_KEYS } from "../artifacts/presentation/keys";
import { isPackagingArtifactKey } from "../artifacts/packaging/keys";
import { isSocialMediaArtifactKey } from "../artifacts/social-media/keys";

export type RenderArtifactDeps = {
  vaultAssetResolver?: VaultAssetResolver;
  /** When false, skip vault asset resolution (fixture-only paths). Default true for deck. */
  requireVaultAssets?: boolean;
  /** When false, skip exact design-system load (tests only). Default true for deck. */
  requireDesignSystem?: boolean;
};

function mapArtifactError(err: unknown): never {
  if (err instanceof CdfArtifactError) {
    if (err.artifactCode === "ARTIFACT_NOT_FOUND") {
      throw renderError("ARTIFACT_NOT_FOUND", err.message);
    }
    if (err.artifactCode === "ARTIFACT_VERSION_NOT_FOUND") {
      throw renderError("ARTIFACT_VERSION_NOT_FOUND", err.message);
    }
    if (err.artifactCode === "ARTIFACT_OWNERSHIP_INVALID") {
      throw renderError("ARTIFACT_OWNERSHIP_INVALID", err.message);
    }
  }
  throw err;
}

function loadDesignSystemForDeck(
  deckData: Record<string, unknown>,
  ownership: { organizationId?: string; projectId?: string },
  required: boolean,
): Record<string, unknown> | undefined {
  const ref = deckData.designSystemRef as
    | { artifactId?: string; version?: number }
    | undefined;
  if (!ref?.artifactId || ref.version == null) {
    if (required) {
      throw renderError(
        "DESIGN_SYSTEM_NOT_FOUND",
        "DeckSpec.designSystemRef missing or incomplete",
      );
    }
    return undefined;
  }
  try {
    const ds = getArtifactVersion(ref.artifactId, ref.version, ownership);
    return ds.data;
  } catch (err) {
    if (err instanceof CdfArtifactError) {
      throw renderError(
        "DESIGN_SYSTEM_NOT_FOUND",
        `Design system ${ref.artifactId}@v${ref.version} not found`,
        { artifactId: ref.artifactId, version: ref.version },
      );
    }
    throw err;
  }
}

function assertRequest(request: CdfRenderRequest): void {
  if (request.artifactVersion == null || !Number.isInteger(request.artifactVersion)) {
    throw renderError(
      "RENDER_REQUEST_INVALID",
      "artifactVersion is required — rendering must not implicitly use latest",
      { artifactId: request.artifactId },
    );
  }
  if (request.artifactVersion < 1) {
    throw renderError(
      "RENDER_REQUEST_INVALID",
      "artifactVersion must be >= 1",
      { artifactVersion: request.artifactVersion },
    );
  }
  if (!request.artifactKey) {
    throw renderError("RENDER_REQUEST_INVALID", "artifactKey is required");
  }
  if (!request.format) {
    throw renderError("RENDER_REQUEST_INVALID", "format is required");
  }
  if (request.purpose !== "preview" && request.purpose !== "final") {
    throw renderError("RENDER_REQUEST_INVALID", "purpose must be preview|final");
  }
  assertRenderTargetArtifactId(request.artifactId);
}

/**
 * Render exact artifact version → RenderedFile.
 * Idempotent for the same renderKey (returns existing record without re-writing creative data).
 */
export async function renderArtifact(
  request: CdfRenderRequest,
  deps: RenderArtifactDeps = {},
): Promise<CdfRenderedFile> {
  const started = Date.now();
  assertRequest(request);

  const ownership = {
    organizationId: request.organizationId,
    projectId: request.projectId,
  };

  let head;
  let versionRecord;
  try {
    head = getArtifact(request.artifactId, ownership);
    versionRecord = getArtifactVersion(
      request.artifactId,
      request.artifactVersion,
      ownership,
    );
  } catch (err) {
    mapArtifactError(err);
  }

  if (request.artifactKey !== head.artifactKey) {
    throw renderError(
      "ARTIFACT_NOT_RENDERABLE",
      `Request artifactKey ${request.artifactKey} does not match artifact ${head.artifactKey}`,
      {
        requested: request.artifactKey,
        actual: head.artifactKey,
      },
    );
  }

  if (
    request.workspaceId &&
    head.workspaceId &&
    request.workspaceId !== head.workspaceId
  ) {
    throw renderError(
      "ARTIFACT_OWNERSHIP_INVALID",
      "Workspace mismatch — refusing cross-tenant render",
      {
        requestWorkspaceId: request.workspaceId,
        artifactWorkspaceId: head.workspaceId,
      },
    );
  }

  assertLifecycleAllowsRender({
    purpose: request.purpose,
    status: versionRecord.status,
    artifactId: request.artifactId,
    artifactVersion: request.artifactVersion,
    head: {
      approvedVersion: head.approvedVersion,
      selectedVersion: head.selectedVersion,
    },
    approvedAt: versionRecord.approvedAt,
    selectedAt: versionRecord.selectedAt,
  });

  const options = normalizeRenderOptions(request.options);
  const optionsHash = hashRenderOptions(options);

  const renderer = resolveRenderer({
    artifactKey: request.artifactKey,
    format: request.format,
    purpose: request.purpose,
    schemaVersion: versionRecord.schemaVersion,
    rendererVersion: request.rendererVersion,
  });

  const renderKey = computeRenderKey({
    artifactId: request.artifactId,
    artifactVersion: request.artifactVersion,
    format: request.format,
    purpose: request.purpose,
    rendererId: renderer.capability.rendererId,
    rendererVersion: renderer.capability.rendererVersion,
    optionsHash,
  });

  const cached = getRenderedFileByRenderKey(renderKey);
  if (cached) {
    console.info(
      JSON.stringify({
        scope: "cdf.rendering",
        event: "render_cache_hit",
        fileId: cached.fileId,
        artifactId: cached.artifactId,
        artifactVersion: cached.artifactVersion,
        artifactKey: cached.artifactKey,
        format: cached.format,
        rendererId: cached.rendererId,
        rendererVersion: cached.rendererVersion,
        renderKey,
        checksum: cached.checksum,
        durationMs: Date.now() - started,
        requestId: request.requestId,
      }),
    );
    return cached;
  }

  const requireAssets =
    deps.requireVaultAssets ??
    (request.artifactKey === PRESENTATION_ARTIFACT_KEYS.deck ||
      isPackagingArtifactKey(request.artifactKey) ||
      isSocialMediaArtifactKey(request.artifactKey));

  let vaultAssetIds: string[] = [];
  if (request.artifactKey === PRESENTATION_ARTIFACT_KEYS.deck) {
    vaultAssetIds = collectVaultAssetIdsFromDeckData(versionRecord.data);
  } else if (isPackagingArtifactKey(request.artifactKey)) {
    assertPackagingUpstreamExactRefs(
      request.artifactKey,
      versionRecord.data,
      ownership,
    );
    const entityIdRaw = options.extras?.entityId ??
      options.extras?.surfaceId ??
      options.extras?.viewId ??
      options.extras?.skuId ??
      options.extras?.candidateId;
    vaultAssetIds = [
      selectPackagingPreviewVaultId(versionRecord.data, {
        entityId: entityIdRaw == null ? undefined : String(entityIdRaw),
      }),
    ];
  } else if (isSocialMediaArtifactKey(request.artifactKey)) {
    assertSocialMediaUpstreamExactRefs(
      request.artifactKey,
      versionRecord.data,
      ownership,
    );
    vaultAssetIds = [selectSocialMediaPreviewVaultId(versionRecord.data)];
  }

  const vaultAssetResolver =
    deps.vaultAssetResolver ?? getDefaultVaultAssetResolver();

  const resolvedAssets = await resolveAssetsForRender({
    vaultAssetIds,
    resolver: vaultAssetResolver,
    organizationId: request.organizationId ?? head.organizationId,
    workspaceId: request.workspaceId ?? head.workspaceId,
    projectId: request.projectId ?? head.projectId,
    requireAll: requireAssets && vaultAssetIds.length > 0,
  });

  const requireDs =
    deps.requireDesignSystem ??
    request.artifactKey === PRESENTATION_ARTIFACT_KEYS.deck;
  const designSystem =
    request.artifactKey === PRESENTATION_ARTIFACT_KEYS.deck
      ? loadDesignSystemForDeck(versionRecord.data, ownership, requireDs)
      : undefined;

  let output;
  try {
    output = await renderer.render({
      artifactId: request.artifactId,
      artifactVersion: request.artifactVersion,
      artifactKey: head.artifactKey,
      artifactType: head.artifactType,
      schemaVersion: versionRecord.schemaVersion,
      status: versionRecord.status,
      data: versionRecord.data,
      format: request.format,
      purpose: request.purpose,
      options,
      rendererId: renderer.capability.rendererId,
      rendererVersion: renderer.capability.rendererVersion,
      organizationId: request.organizationId ?? head.organizationId,
      workspaceId: request.workspaceId ?? head.workspaceId,
      projectId: request.projectId ?? head.projectId,
      resolvedAssets,
      designSystem,
    });
  } catch (err) {
    if (err && typeof err === "object" && "renderCode" in err) throw err;
    throw renderError(
      "RENDER_FAILED",
      err instanceof Error ? err.message : "Renderer failed",
      {
        artifactId: request.artifactId,
        artifactVersion: request.artifactVersion,
        format: request.format,
      },
    );
  }

  const checksum = sha256Hex(output.bytes);
  const orgId =
    request.organizationId ?? head.organizationId ?? "org_unknown";
  const storageKey = buildTenantRenderStorageKey({
    organizationId: orgId,
    artifactId: request.artifactId,
    artifactVersion: request.artifactVersion,
    renderKey,
  });

  try {
    putRenderedBlob({
      storageKey,
      bytes: output.bytes,
      checksum,
      mimeType: output.mimeType,
    });
    await putRenderedBlobToBackend({
      storageKey,
      bytes: output.bytes,
      mimeType: output.mimeType,
    });
  } catch (err) {
    if (err && typeof err === "object" && "renderCode" in err) throw err;
    throw renderError("STORAGE_FAILED", "Failed to store rendered bytes", {
      storageKey,
    });
  }

  const createdAt = new Date().toISOString();
  const fileId = createCdfRenderedFileId(request.format);

  const record: CdfRenderedFile = {
    fileId,
    artifactId: request.artifactId,
    artifactVersion: request.artifactVersion,
    artifactKey: head.artifactKey,
    format: request.format,
    purpose: request.purpose,
    mimeType: output.mimeType,
    storageKey,
    checksum,
    byteLength: output.bytes.byteLength,
    rendererId: renderer.capability.rendererId,
    rendererVersion: renderer.capability.rendererVersion,
    renderOptionsHash: optionsHash,
    renderKey,
    createdAt,
    organizationId: request.organizationId ?? head.organizationId,
    workspaceId: request.workspaceId ?? head.workspaceId,
    projectId: request.projectId ?? head.projectId,
    artifactStatusAtRender: versionRecord.status,
    requestId: request.requestId,
  };

  const saved = saveRenderedFile(record);

  console.info(
    JSON.stringify({
      scope: "cdf.rendering",
      event: "render_complete",
      fileId: saved.fileId,
      artifactId: saved.artifactId,
      artifactVersion: saved.artifactVersion,
      artifactKey: saved.artifactKey,
      format: saved.format,
      purpose: saved.purpose,
      rendererId: saved.rendererId,
      rendererVersion: saved.rendererVersion,
      renderKey: saved.renderKey,
      checksum: saved.checksum,
      storageKey: saved.storageKey,
      durationMs: Date.now() - started,
      requestId: request.requestId,
      cache: "miss",
    }),
  );

  return saved;
}
