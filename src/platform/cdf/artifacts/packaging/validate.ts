/**
 * Structural validators for Packaging artifact data (M8A).
 * Semantic/creative validation is M4 — not here.
 */

import {
  isExecutionIdShape,
  isCdfCanonicalArtifactId,
  isVaultAssetObjectIdShape,
} from "../ids";
import {
  isValidPanelNormalizedBounds,
  isValidPositiveMm,
  PACKAGING_PANEL_COORDINATE_SYSTEM,
  PACKAGING_PHYSICAL_COORDINATE_SYSTEM,
  PACKAGING_VIEW_CAMERA_SYSTEM,
} from "./coordinates";
import {
  PACKAGING_ARTIFACT_KEYS,
  packagingSchemaId,
  type PackagingArtifactKey,
} from "./keys";

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

/** Reject provider envelopes that are image/URL/exec-only pretending to be structure. */
export function rejectImageOnlyPackagingEnvelope(
  data: Record<string, unknown>,
  label: string,
): Result {
  const keys = Object.keys(data).filter((k) => k !== "schemaId");
  const imageOnlyKeys = new Set([
    "url",
    "imageUrl",
    "image_url",
    "mediaUrl",
    "mediaId",
    "artId",
    "artifactId",
    "executionId",
    "previewUrl",
    "src",
    "image",
  ]);
  if (keys.length === 0) {
    return fail(`${label}: empty payload is not structured packaging state`);
  }
  if (keys.every((k) => imageOnlyKeys.has(k))) {
    return fail(
      `${label}: image/URL/execution-only envelope is not canonical packaging structure`,
    );
  }
  // Single media pointer without candidates/routes/surfaces/etc.
  if (
    keys.length <= 2 &&
    (data.url != null ||
      data.imageUrl != null ||
      data.mediaId != null ||
      data.image != null) &&
    data.candidates == null &&
    data.routes == null &&
    data.surfaces == null &&
    data.views == null &&
    data.skus == null &&
    data.pathKind == null &&
    data.frontId == null
  ) {
    return fail(
      `${label}: image-only output is not accepted as structured packaging state`,
    );
  }
  return ok();
}

export function validatePackagingDielineData(
  data: Record<string, unknown>,
): Result {
  const expected = packagingSchemaId(PACKAGING_ARTIFACT_KEYS.dieline);
  if (data.schemaId !== expected) return fail(`schemaId must be ${expected}`);
  const pathKinds = new Set(["upload_dieline", "none", "existing_pack"]);
  if (!pathKinds.has(String(data.pathKind))) {
    return fail("pathKind must be upload_dieline | none | existing_pack");
  }
  if (data.dimensions != null) {
    if (!isPlainObject(data.dimensions)) return fail("dimensions must be object");
    if (data.dimensions.coordinateSystem !== PACKAGING_PHYSICAL_COORDINATE_SYSTEM) {
      return fail("dimensions.coordinateSystem must be physical_mm");
    }
    if (!isValidPositiveMm(data.dimensions.widthMm)) {
      return fail("dimensions.widthMm must be a positive finite number");
    }
    if (!isValidPositiveMm(data.dimensions.heightMm)) {
      return fail("dimensions.heightMm must be a positive finite number");
    }
    if (
      data.dimensions.depthMm != null &&
      !isValidPositiveMm(data.dimensions.depthMm)
    ) {
      return fail("dimensions.depthMm must be a positive finite number when set");
    }
  }
  if (data.panels != null) {
    if (!Array.isArray(data.panels)) return fail("panels must be an array");
    const ids: string[] = [];
    for (const p of data.panels) {
      if (!isPlainObject(p) || !isStableId(p.id)) {
        return fail("panels[].id must be a stable id");
      }
      ids.push(p.id);
      if (p.bounds != null) {
        if (!isPlainObject(p.bounds)) return fail("panels[].bounds must be object");
        if (p.bounds.coordinateSystem !== PACKAGING_PANEL_COORDINATE_SYSTEM) {
          return fail("panels[].bounds.coordinateSystem must be panel_normalized");
        }
        if (!isValidPanelNormalizedBounds(p.bounds as never)) {
          return fail("panels[].bounds invalid panel_normalized bounds");
        }
      }
    }
    const u = assertUniqueIds(ids, "panels");
    if (!u.ok) return u;
  }
  if (data.uploadedAssetRefs != null) {
    if (!Array.isArray(data.uploadedAssetRefs)) {
      return fail("uploadedAssetRefs must be an array");
    }
    for (const a of data.uploadedAssetRefs) {
      const r = assertPreviewAssetRef(a, "uploadedAssetRefs[]");
      if (!r.ok) return r;
    }
  }
  return validateSourceRefs(data.sourceRefs, "sourceRefs");
}

export function validatePackagingRoutesData(
  data: Record<string, unknown>,
): Result {
  const expected = packagingSchemaId(PACKAGING_ARTIFACT_KEYS.routes);
  if (data.schemaId !== expected) return fail(`schemaId must be ${expected}`);
  if (!Array.isArray(data.routes) || data.routes.length < 1) {
    return fail("routes must be a non-empty array");
  }
  const ids: string[] = [];
  for (const route of data.routes) {
    if (!isPlainObject(route)) return fail("routes[] must be objects");
    if (!isStableId(route.routeId)) return fail("routes[].routeId invalid");
    if (!isNonEmptyString(route.name)) return fail("routes[].name required");
    if ("selected" in route || "approved" in route || "isSelected" in route) {
      return fail("routes[] must not encode selection/approval flags");
    }
    ids.push(route.routeId as string);
    if (route.representativeAssetIds != null) {
      if (!Array.isArray(route.representativeAssetIds)) {
        return fail("routes[].representativeAssetIds must be an array");
      }
      for (const id of route.representativeAssetIds) {
        const r = assertVaultAssetId(id, "routes[].representativeAssetIds[]");
        if (!r.ok) return r;
      }
    }
  }
  const u = assertUniqueIds(ids, "routes");
  if (!u.ok) return u;
  if (data.selectedRouteId != null) {
    if (!isStableId(data.selectedRouteId)) {
      return fail("selectedRouteId invalid");
    }
    if (!ids.includes(data.selectedRouteId as string)) {
      return fail("selectedRouteId must reference an existing routeId");
    }
  }
  const dRef = assertExactArtifactRef(data.dielineRef, "dielineRef", false);
  if (!dRef.ok) return dRef;
  return validateSourceRefs(data.sourceRefs, "sourceRefs");
}

export function validatePackaging3dDirectionData(
  data: Record<string, unknown>,
): Result {
  const img = rejectImageOnlyPackagingEnvelope(data, "packaging.3d-direction");
  if (!img.ok) return img;
  const expected = packagingSchemaId(PACKAGING_ARTIFACT_KEYS.threeDDirection);
  if (data.schemaId !== expected) return fail(`schemaId must be ${expected}`);
  if (!Array.isArray(data.candidates) || data.candidates.length < 1) {
    return fail("candidates must be a non-empty array");
  }
  const ids: string[] = [];
  for (const c of data.candidates) {
    if (!isPlainObject(c)) return fail("candidates[] must be objects");
    if (!isStableId(c.id)) return fail("candidates[].id invalid");
    if (!isNonEmptyString(c.name)) return fail("candidates[].name required");
    if (!isNonEmptyString(c.visualIntent)) {
      return fail("candidates[].visualIntent required");
    }
    ids.push(c.id as string);
    const prev = assertPreviewAssetRef(c.previewAssetRef, "candidates[].previewAssetRef");
    if (!prev.ok) return prev;
  }
  const u = assertUniqueIds(ids, "candidates");
  if (!u.ok) return u;
  if (data.selectedCandidateId != null) {
    if (!ids.includes(String(data.selectedCandidateId))) {
      return fail("selectedCandidateId must reference an existing candidate id");
    }
  }
  const d = assertExactArtifactRef(data.dielineRef, "dielineRef", true);
  if (!d.ok) return d;
  const r = assertExactArtifactRef(data.routesRef, "routesRef", true);
  if (!r.ok) return r;
  return validateSourceRefs(data.sourceRefs, "sourceRefs");
}

export function validatePackagingFrontPackData(
  data: Record<string, unknown>,
): Result {
  const img = rejectImageOnlyPackagingEnvelope(data, "packaging.front-pack");
  if (!img.ok) return img;
  const expected = packagingSchemaId(PACKAGING_ARTIFACT_KEYS.frontPack);
  if (data.schemaId !== expected) return fail(`schemaId must be ${expected}`);
  if (!isStableId(data.frontId)) return fail("frontId must be a stable id");
  const d = assertExactArtifactRef(data.dielineRef, "dielineRef", false);
  if (!d.ok) return d;
  const r = assertExactArtifactRef(data.routesRef, "routesRef", true);
  if (!r.ok) return r;
  const t = assertExactArtifactRef(
    data.threeDDirectionRef,
    "threeDDirectionRef",
    true,
  );
  if (!t.ok) return t;
  const prev = assertPreviewAssetRef(data.previewAssetRef, "previewAssetRef");
  if (!prev.ok) return prev;
  return validateSourceRefs(data.sourceRefs, "sourceRefs");
}

export function validatePackagingCompletePackData(
  data: Record<string, unknown>,
): Result {
  const img = rejectImageOnlyPackagingEnvelope(data, "packaging.complete-pack");
  if (!img.ok) return img;
  const expected = packagingSchemaId(PACKAGING_ARTIFACT_KEYS.completePack);
  if (data.schemaId !== expected) return fail(`schemaId must be ${expected}`);
  if (!Array.isArray(data.surfaces) || data.surfaces.length < 1) {
    return fail("surfaces must be a non-empty array");
  }
  const ids: string[] = [];
  const roles = new Set([
    "front",
    "back",
    "side",
    "top",
    "bottom",
    "flat",
    "other",
  ]);
  for (const s of data.surfaces) {
    if (!isPlainObject(s)) return fail("surfaces[] must be objects");
    if (!isStableId(s.id)) return fail("surfaces[].id invalid");
    if (!roles.has(String(s.role))) return fail("surfaces[].role invalid");
    ids.push(s.id as string);
    const prev = assertPreviewAssetRef(s.previewAssetRef, "surfaces[].previewAssetRef");
    if (!prev.ok) return prev;
  }
  const u = assertUniqueIds(ids, "surfaces");
  if (!u.ok) return u;
  for (const path of [
    "dielineRef",
    "routesRef",
    "threeDDirectionRef",
    "frontPackRef",
  ] as const) {
    const r = assertExactArtifactRef(data[path], path, true);
    if (!r.ok) return r;
  }
  return validateSourceRefs(data.sourceRefs, "sourceRefs");
}

export function validatePackagingViewsData(
  data: Record<string, unknown>,
): Result {
  const img = rejectImageOnlyPackagingEnvelope(data, "packaging.views");
  if (!img.ok) return img;
  const expected = packagingSchemaId(PACKAGING_ARTIFACT_KEYS.views);
  if (data.schemaId !== expected) return fail(`schemaId must be ${expected}`);
  if (!Array.isArray(data.views) || data.views.length < 1) {
    return fail("views must be a non-empty array");
  }
  const ids: string[] = [];
  for (const v of data.views) {
    if (!isPlainObject(v)) return fail("views[] must be objects");
    if (!isStableId(v.id)) return fail("views[].id invalid");
    if (!isNonEmptyString(v.name)) return fail("views[].name required");
    ids.push(v.id as string);
    if (v.camera != null) {
      if (!isPlainObject(v.camera)) return fail("views[].camera must be object");
      if (v.camera.coordinateSystem !== PACKAGING_VIEW_CAMERA_SYSTEM) {
        return fail("views[].camera.coordinateSystem must be view_camera_degrees");
      }
    }
    const prev = assertPreviewAssetRef(v.previewAssetRef, "views[].previewAssetRef");
    if (!prev.ok) return prev;
  }
  const u = assertUniqueIds(ids, "views");
  if (!u.ok) return u;
  const c = assertExactArtifactRef(data.completePackRef, "completePackRef", true);
  if (!c.ok) return c;
  return validateSourceRefs(data.sourceRefs, "sourceRefs");
}

export function validatePackagingSkuAdaptationsData(
  data: Record<string, unknown>,
): Result {
  const img = rejectImageOnlyPackagingEnvelope(data, "packaging.sku-adaptations");
  if (!img.ok) return img;
  const expected = packagingSchemaId(PACKAGING_ARTIFACT_KEYS.skuAdaptations);
  if (data.schemaId !== expected) return fail(`schemaId must be ${expected}`);
  if (!Array.isArray(data.skus) || data.skus.length < 1) {
    return fail("skus must be a non-empty array");
  }
  const ids: string[] = [];
  for (const s of data.skus) {
    if (!isPlainObject(s)) return fail("skus[] must be objects");
    if (!isStableId(s.id)) return fail("skus[].id invalid");
    if (!isNonEmptyString(s.label)) return fail("skus[].label required");
    ids.push(s.id as string);
    const prev = assertPreviewAssetRef(s.previewAssetRef, "skus[].previewAssetRef");
    if (!prev.ok) return prev;
  }
  const u = assertUniqueIds(ids, "skus");
  if (!u.ok) return u;
  const v = assertExactArtifactRef(data.viewsRef, "viewsRef", true);
  if (!v.ok) return v;
  const c = assertExactArtifactRef(data.completePackRef, "completePackRef", false);
  if (!c.ok) return c;
  return validateSourceRefs(data.sourceRefs, "sourceRefs");
}

export function validatePackagingArtifactData(
  artifactKey: PackagingArtifactKey,
  data: unknown,
): Result {
  if (!isPlainObject(data)) return fail("data must be a plain object");
  switch (artifactKey) {
    case PACKAGING_ARTIFACT_KEYS.dieline:
      return validatePackagingDielineData(data);
    case PACKAGING_ARTIFACT_KEYS.routes:
      return validatePackagingRoutesData(data);
    case PACKAGING_ARTIFACT_KEYS.threeDDirection:
      return validatePackaging3dDirectionData(data);
    case PACKAGING_ARTIFACT_KEYS.frontPack:
      return validatePackagingFrontPackData(data);
    case PACKAGING_ARTIFACT_KEYS.completePack:
      return validatePackagingCompletePackData(data);
    case PACKAGING_ARTIFACT_KEYS.views:
      return validatePackagingViewsData(data);
    case PACKAGING_ARTIFACT_KEYS.skuAdaptations:
      return validatePackagingSkuAdaptationsData(data);
    default:
      return fail(`Unknown packaging artifact key: ${String(artifactKey)}`);
  }
}
