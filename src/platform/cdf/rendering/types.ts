/**
 * CDF 2.0 M5 — Renderer architecture types.
 *
 * Canonical Artifact = source of truth.
 * RenderedFile = representation only.
 *
 * Rendering must never call AI, mutate creative data, or invent requirements.
 */

import type { CdfCanonicalArtifactStatus } from "../artifacts/types";

/** Representation formats declared by M3B schemas / future renderers. */
export type CdfRenderFormat =
  | "preview"
  | "pptx"
  | "pdf"
  | "png"
  | "jpg"
  | "svg"
  | "mp4"
  | "fixture"; // deterministic test representation only

/**
 * Preview = review representation (may allow validated/selected).
 * Final = deliverable representation (requires approved).
 */
export type CdfRenderPurpose = "preview" | "final";

export type CdfRenderOptions = {
  /** Logical page / canvas size label (e.g. "slide", "A4"). */
  pageSize?: string;
  /** Output pixel width for raster/preview. */
  widthPx?: number;
  /** Output pixel height for raster/preview. */
  heightPx?: number;
  /** Image quality 1–100 where applicable. */
  imageQuality?: number;
  /** Include slide notes when format supports it. */
  includeNotes?: boolean;
  /** Background behavior hint — must not invent creative content. */
  background?: "preserve" | "transparent" | "white";
  /** Extra deterministic knobs (serializable primitives only). */
  extras?: Record<string, string | number | boolean | null>;
};

export type CdfRenderRequest = {
  /** Exact cdfart_* identity — never "latest". */
  artifactId: string;
  /** Exact immutable version number — required. */
  artifactVersion: number;
  artifactKey: string;
  format: CdfRenderFormat;
  purpose: CdfRenderPurpose;
  options?: CdfRenderOptions;
  /** Pin a specific registered renderer version when set. */
  rendererVersion?: string;
  requestId?: string;
  organizationId?: string;
  workspaceId?: string;
  projectId?: string;
  /** Optional correlator for observability. */
  correlationId?: string;
};

export type CdfRenderedFile = {
  /** Representation identity — `cdfrndf_*` — NOT cdfart_ / art_ / exec_ / Vault ObjectId. */
  fileId: string;
  artifactId: string;
  artifactVersion: number;
  artifactKey: string;
  format: CdfRenderFormat;
  purpose: CdfRenderPurpose;
  mimeType: string;
  /** Blob storage key (tenant-scoped). Bytes live outside Mongo/artifact.data. */
  storageKey: string;
  /** SHA-256 of rendered bytes. */
  checksum: string;
  byteLength: number;
  rendererId: string;
  rendererVersion: string;
  renderOptionsHash: string;
  /** Deterministic idempotency / cache key. */
  renderKey: string;
  createdAt: string;
  organizationId?: string;
  workspaceId?: string;
  projectId?: string;
  /** Artifact lifecycle status observed at render time (informational). */
  artifactStatusAtRender: CdfCanonicalArtifactStatus;
  requestId?: string;
};

export type CdfRendererCapability = {
  rendererId: string;
  rendererVersion: string;
  artifactKeys: readonly string[];
  formats: readonly CdfRenderFormat[];
  purposes: readonly CdfRenderPurpose[];
  /** Human-readable contract note (not a prompt). */
  description?: string;
};

export type CdfRendererInput = {
  artifactId: string;
  artifactVersion: number;
  artifactKey: string;
  artifactType: string;
  schemaVersion: string;
  status: CdfCanonicalArtifactStatus;
  /** Immutable creative payload — treat as read-only. */
  data: Readonly<Record<string, unknown>>;
  format: CdfRenderFormat;
  purpose: CdfRenderPurpose;
  options: CdfRenderOptions;
  rendererId: string;
  rendererVersion: string;
  organizationId?: string;
  workspaceId?: string;
  projectId?: string;
  /** Resolved vault assets (bytes keyed by vaultAssetId). */
  resolvedAssets: ReadonlyMap<string, Uint8Array>;
  /**
   * Exact Design System payload when artifactKey is presentation.deck.
   * Loaded by render service from designSystemRef — never "latest".
   */
  designSystem?: Readonly<Record<string, unknown>>;
};

export type CdfRendererOutput = {
  bytes: Uint8Array;
  mimeType: string;
};

/**
 * Canonical renderer interface.
 * Implementations must be pure w.r.t. creative content (no AI / no mutation).
 */
export interface ArtifactRenderer {
  readonly capability: CdfRendererCapability;
  canRender(input: {
    artifactKey: string;
    format: CdfRenderFormat;
    purpose: CdfRenderPurpose;
    schemaVersion?: string;
  }): boolean;
  render(input: CdfRendererInput): Promise<CdfRendererOutput>;
}

export type CdfRenderErrorCode =
  | "ARTIFACT_NOT_FOUND"
  | "ARTIFACT_VERSION_NOT_FOUND"
  | "ARTIFACT_SCHEMA_UNSUPPORTED"
  | "RENDER_FORMAT_UNSUPPORTED"
  | "RENDERER_NOT_FOUND"
  | "RENDERER_VERSION_UNSUPPORTED"
  | "INVALID_RENDER_OPTIONS"
  | "ARTIFACT_NOT_RENDERABLE"
  | "ARTIFACT_LIFECYCLE_NOT_ALLOWED"
  | "RENDER_FAILED"
  | "STORAGE_FAILED"
  | "RENDER_IDEMPOTENCY_CONFLICT"
  | "ASSET_NOT_FOUND"
  | "ASSET_RESOLUTION_FAILED"
  | "ARTIFACT_OWNERSHIP_INVALID"
  | "RENDER_REQUEST_INVALID"
  | "FONT_NOT_FOUND"
  | "UNSUPPORTED_DECK_ELEMENT"
  | "UNSUPPORTED_DIMENSIONS"
  | "DESIGN_SYSTEM_NOT_FOUND"
  | "INVALID_DECK_SPEC";

/** Presentation deck render contract (M5 capability; M5B implements pptx/pdf). */
export type PresentationDeckRenderContract = {
  artifactKey: "presentation.deck";
  schemaVersion: "1";
  consumes: readonly ["DeckSpec", "DesignSystem(exact version)", "VaultAssets"];
  doesNotConsume: readonly [
    "RequirementEngine",
    "ContextResolver",
    "ActiveBrief",
    "AI providers",
  ];
  formats: readonly ["preview", "pptx", "pdf"];
  implementationStatus: {
    preview: "contract_only";
    pptx: "implemented_m5b";
    pdf: "implemented_m5b";
    fixture: "available_for_tests";
  };
};
