/**
 * Structural validators for Social Media artifact data (M9A).
 * Semantic/creative validation is M4 / M9C — not here.
 */

import {
  isExecutionIdShape,
  isCdfCanonicalArtifactId,
  isVaultAssetObjectIdShape,
} from "../ids";
import {
  isValidPositivePx,
  isValidSocialMediaPixelCanvas,
  SOCIAL_MEDIA_PIXEL_COORDINATE_SYSTEM,
  type SocialMediaPixelCanvas,
} from "./coordinates";
import {
  SOCIAL_MEDIA_ARTIFACT_KEYS,
  socialMediaSchemaId,
  type SocialMediaArtifactKey,
} from "./keys";
import { SOCIAL_MEDIA_PLATFORMS } from "./types";

type Ok = { ok: true };
type Fail = { ok: false; message: string };
type Result = Ok | Fail;

function fail(message: string): Fail {
  return { ok: false, message };
}

function ok(): Ok {
  return { ok: true };
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function isStableId(v: unknown): v is string {
  return typeof v === "string" && /^[a-zA-Z][a-zA-Z0-9._-]{0,127}$/.test(v);
}

function assertUniqueIds(ids: string[], label: string): Result {
  const seen = new Set<string>();
  for (const id of ids) {
    if (!isStableId(id)) {
      return fail(`${label} has invalid stable id: ${String(id)}`);
    }
    if (seen.has(id)) {
      return fail(`${label} duplicate id: ${id}`);
    }
    seen.add(id);
  }
  return ok();
}

function assertVaultAssetId(id: unknown, label: string): Result {
  if (typeof id !== "string") {
    return fail(`${label} must be a string Vault ObjectId`);
  }
  if (isExecutionIdShape(id)) {
    return fail(`${label} must not be an execution id`);
  }
  if (isCdfCanonicalArtifactId(id)) {
    return fail(`${label} must not be a CDF artifact id`);
  }
  if (id.startsWith("art_")) {
    return fail(`${label} must not be a legacy art_* id`);
  }
  if (!isVaultAssetObjectIdShape(id)) {
    return fail(`${label} must be a 24-hex Vault ObjectId`);
  }
  return ok();
}

function assertExactArtifactRef(
  ref: unknown,
  path: string,
  required = true,
): Result {
  if (ref == null) {
    return required ? fail(`${path} is required`) : ok();
  }
  if (!isPlainObject(ref)) return fail(`${path} must be an object`);
  if (!isCdfCanonicalArtifactId(String(ref.artifactId ?? ""))) {
    return fail(`${path}.artifactId must be a cdfart_* id`);
  }
  if (ref.version === "latest" || ref.version === "HEAD") {
    return fail(`${path}.version must not be latest/HEAD`);
  }
  if (!Number.isInteger(ref.version) || (ref.version as number) < 1) {
    return fail(`${path}.version must be integer >= 1`);
  }
  if (ref.artifactKey != null && !isNonEmptyString(ref.artifactKey)) {
    return fail(`${path}.artifactKey must be a non-empty string when set`);
  }
  return ok();
}

function validateSourceRefs(refs: unknown, path: string): Result {
  if (refs == null) return ok();
  if (!isPlainObject(refs)) return fail(`${path} must be an object`);
  if (refs.executionId != null) {
    if (typeof refs.executionId !== "string") {
      return fail(`${path}.executionId must be a string`);
    }
    if (isVaultAssetObjectIdShape(refs.executionId)) {
      return fail(`${path}.executionId must not look like a Vault ObjectId`);
    }
    if (isCdfCanonicalArtifactId(refs.executionId)) {
      return fail(`${path}.executionId must not be a cdfart_* id`);
    }
  }
  if (refs.vaultAssetIds != null) {
    if (!Array.isArray(refs.vaultAssetIds)) {
      return fail(`${path}.vaultAssetIds must be an array`);
    }
    for (const id of refs.vaultAssetIds) {
      const r = assertVaultAssetId(id, `${path}.vaultAssetIds[]`);
      if (!r.ok) return r;
    }
  }
  if (refs.upstreamArtifactRefs != null) {
    if (!Array.isArray(refs.upstreamArtifactRefs)) {
      return fail(`${path}.upstreamArtifactRefs must be an array`);
    }
    for (const u of refs.upstreamArtifactRefs) {
      if (!isPlainObject(u)) {
        return fail(`${path}.upstreamArtifactRefs[] must be objects`);
      }
      if (!isCdfCanonicalArtifactId(String(u.artifactId ?? ""))) {
        return fail(`${path}.upstreamArtifactRefs[].artifactId invalid`);
      }
      if (u.version === "latest" || u.version === "HEAD") {
        return fail(
          `${path}.upstreamArtifactRefs[].version must not be latest/HEAD`,
        );
      }
      if (!Number.isInteger(u.version) || (u.version as number) < 1) {
        return fail(
          `${path}.upstreamArtifactRefs[].version must be integer >= 1`,
        );
      }
      if (!isNonEmptyString(u.artifactKey)) {
        return fail(`${path}.upstreamArtifactRefs[].artifactKey required`);
      }
    }
  }
  return ok();
}

function assertPreviewAssetRef(ref: unknown, path: string): Result {
  if (ref == null) return ok();
  if (!isPlainObject(ref)) return fail(`${path} must be an object`);
  return assertVaultAssetId(ref.vaultAssetId, `${path}.vaultAssetId`);
}

function validateCanvas(canvas: unknown, path: string): Result {
  if (canvas == null) return ok();
  if (!isPlainObject(canvas)) return fail(`${path} must be an object`);
  if (canvas.coordinateSystem !== SOCIAL_MEDIA_PIXEL_COORDINATE_SYSTEM) {
    return fail(
      `${path}.coordinateSystem must be ${SOCIAL_MEDIA_PIXEL_COORDINATE_SYSTEM}`,
    );
  }
  if (!isValidPositivePx(canvas.widthPx) || !isValidPositivePx(canvas.heightPx)) {
    return fail(`${path} widthPx/heightPx must be positive integers`);
  }
  if (
    !isValidSocialMediaPixelCanvas(canvas as SocialMediaPixelCanvas)
  ) {
    return fail(`${path} is not a valid social_pixel canvas`);
  }
  return ok();
}

/** Reject provider envelopes that are image/URL/exec-only pretending to be structure. */
export function rejectImageOnlySocialMediaEnvelope(
  data: unknown,
  label: string,
): Result {
  if (!isPlainObject(data)) return fail(`${label} must be an object`);
  const keys = Object.keys(data);
  const onlyMedia =
    keys.length > 0 &&
    keys.every((k) =>
      [
        "url",
        "imageUrl",
        "mediaUrl",
        "artifactId",
        "artId",
        "executionId",
        "mimeType",
      ].includes(k),
    );
  if (onlyMedia) {
    return fail(
      `${label}: image/URL/exec-only envelope is not canonical Social Media structure`,
    );
  }
  if (
    typeof data.url === "string" &&
    !data.schemaId &&
    !data.creativeId &&
    !data.routes
  ) {
    return fail(`${label}: bare URL is not canonical Social Media structure`);
  }
  return ok();
}

export function validateSocialMediaPlatformData(data: unknown): Result {
  if (!isPlainObject(data)) return fail("platform data must be an object");
  if (data.schemaId !== socialMediaSchemaId(SOCIAL_MEDIA_ARTIFACT_KEYS.platform)) {
    return fail("platform.schemaId mismatch");
  }
  if (!isStableId(data.platformId)) {
    return fail("platform.platformId must be a stable id");
  }
  if (
    typeof data.platform !== "string" ||
    !(SOCIAL_MEDIA_PLATFORMS as readonly string[]).includes(data.platform)
  ) {
    return fail(
      `platform.platform must be one of: ${SOCIAL_MEDIA_PLATFORMS.join(", ")}`,
    );
  }
  return validateSourceRefs(data.sourceRefs, "platform.sourceRefs");
}

export function validateSocialMediaSizeReferenceData(data: unknown): Result {
  if (!isPlainObject(data)) return fail("size-reference data must be an object");
  if (
    data.schemaId !==
    socialMediaSchemaId(SOCIAL_MEDIA_ARTIFACT_KEYS.sizeReference)
  ) {
    return fail("size-reference.schemaId mismatch");
  }
  if (!isStableId(data.optionId)) {
    return fail("size-reference.optionId must be a stable id");
  }
  const kinds = [
    "enter_size",
    "use_platform_size",
    "upload_reference",
    "skip",
  ];
  if (
    typeof data.pathKind !== "string" ||
    !kinds.includes(data.pathKind)
  ) {
    return fail(`size-reference.pathKind must be one of: ${kinds.join(", ")}`);
  }
  const canvasR = validateCanvas(data.canvas, "size-reference.canvas");
  if (!canvasR.ok) return canvasR;
  if (data.pathKind === "enter_size" && data.canvas == null) {
    return fail("size-reference.enter_size requires canvas widthPx/heightPx");
  }
  if (data.referenceAssetRefs != null) {
    if (!Array.isArray(data.referenceAssetRefs)) {
      return fail("size-reference.referenceAssetRefs must be an array");
    }
    for (let i = 0; i < data.referenceAssetRefs.length; i++) {
      const r = assertPreviewAssetRef(
        data.referenceAssetRefs[i],
        `size-reference.referenceAssetRefs[${i}]`,
      );
      if (!r.ok) return r;
    }
  }
  const platformR = assertExactArtifactRef(
    data.platformRef,
    "size-reference.platformRef",
    false,
  );
  if (!platformR.ok) return platformR;
  return validateSourceRefs(data.sourceRefs, "size-reference.sourceRefs");
}

export function validateSocialMediaRoutesData(data: unknown): Result {
  if (!isPlainObject(data)) return fail("routes data must be an object");
  if (data.schemaId !== socialMediaSchemaId(SOCIAL_MEDIA_ARTIFACT_KEYS.routes)) {
    return fail("routes.schemaId mismatch");
  }
  if (!Array.isArray(data.routes) || data.routes.length === 0) {
    return fail("routes.routes must be a non-empty array");
  }
  // M1 cardinality exactly(3) — enforce structural expectation
  if (data.routes.length !== 3) {
    return fail("routes.routes must contain exactly 3 directions (M1 cardinality)");
  }
  const ids: string[] = [];
  for (let i = 0; i < data.routes.length; i++) {
    const route = data.routes[i];
    if (!isPlainObject(route)) {
      return fail(`routes.routes[${i}] must be an object`);
    }
    if (!isStableId(route.routeId)) {
      return fail(`routes.routes[${i}].routeId must be a stable id`);
    }
    if (!isNonEmptyString(route.name)) {
      return fail(`routes.routes[${i}].name is required`);
    }
    ids.push(route.routeId);
  }
  const uniq = assertUniqueIds(ids, "routes.routes");
  if (!uniq.ok) return uniq;
  if (data.selectedRouteId != null) {
    if (!isStableId(data.selectedRouteId)) {
      return fail("routes.selectedRouteId must be a stable id");
    }
    if (!ids.includes(data.selectedRouteId)) {
      return fail("routes.selectedRouteId must reference an existing routeId");
    }
  }
  const p = assertExactArtifactRef(data.platformRef, "routes.platformRef", false);
  if (!p.ok) return p;
  const s = assertExactArtifactRef(
    data.sizeReferenceRef,
    "routes.sizeReferenceRef",
    false,
  );
  if (!s.ok) return s;
  return validateSourceRefs(data.sourceRefs, "routes.sourceRefs");
}

export function validateSocialMediaOutputData(data: unknown): Result {
  const img = rejectImageOnlySocialMediaEnvelope(data, "social-media.output");
  if (!img.ok) return img;
  if (!isPlainObject(data)) return fail("output data must be an object");
  if (data.schemaId !== socialMediaSchemaId(SOCIAL_MEDIA_ARTIFACT_KEYS.output)) {
    return fail("output.schemaId mismatch");
  }
  if (!isStableId(data.creativeId)) {
    return fail("output.creativeId must be a stable id");
  }
  const routesR = assertExactArtifactRef(data.routesRef, "output.routesRef", true);
  if (!routesR.ok) return routesR;
  const p = assertExactArtifactRef(data.platformRef, "output.platformRef", false);
  if (!p.ok) return p;
  const s = assertExactArtifactRef(
    data.sizeReferenceRef,
    "output.sizeReferenceRef",
    false,
  );
  if (!s.ok) return s;
  const canvasR = validateCanvas(data.canvas, "output.canvas");
  if (!canvasR.ok) return canvasR;
  if (data.onImageCopy != null) {
    if (!isPlainObject(data.onImageCopy)) {
      return fail("output.onImageCopy must be an object");
    }
    const prov = data.onImageCopy.provenance;
    if (
      prov != null &&
      !["user_provided", "ai_generated", "mixed", "unknown"].includes(
        String(prov),
      )
    ) {
      return fail("output.onImageCopy.provenance invalid");
    }
  }
  const prev = assertPreviewAssetRef(
    data.previewAssetRef,
    "output.previewAssetRef",
  );
  if (!prev.ok) return prev;
  return validateSourceRefs(data.sourceRefs, "output.sourceRefs");
}

export function validateSocialMediaArtifactData(
  artifactKey: SocialMediaArtifactKey,
  data: unknown,
): Result {
  switch (artifactKey) {
    case SOCIAL_MEDIA_ARTIFACT_KEYS.platform:
      return validateSocialMediaPlatformData(data);
    case SOCIAL_MEDIA_ARTIFACT_KEYS.sizeReference:
      return validateSocialMediaSizeReferenceData(data);
    case SOCIAL_MEDIA_ARTIFACT_KEYS.routes:
      return validateSocialMediaRoutesData(data);
    case SOCIAL_MEDIA_ARTIFACT_KEYS.output:
      return validateSocialMediaOutputData(data);
    default:
      return fail(`Unknown Social Media artifact key: ${String(artifactKey)}`);
  }
}
