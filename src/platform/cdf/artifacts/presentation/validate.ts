/**
 * Structural validators for Presentation artifact data (M3B).
 * Semantic/creative validation is M4 — not here.
 */

import {
  isExecutionIdShape,
  isCdfCanonicalArtifactId,
  isVaultAssetObjectIdShape,
} from "../ids";
import { isValidNormalizedBounds } from "./coordinates";
import {
  PRESENTATION_ARTIFACT_KEYS,
  presentationSchemaId,
  type PresentationArtifactKey,
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

function assertNoRendererLeak(data: Record<string, unknown>): Result {
  const banned = [
    "pptxXml",
    "pptXml",
    "pdfOperators",
    "pdfDrawingCommands",
    "ooxml",
    "emfBlob",
    "renderedFileId",
    "pptxPath",
    "pdfPath",
  ];
  for (const key of banned) {
    if (key in data) {
      return fail(`Renderer-specific field "${key}" is not allowed in canonical data`);
    }
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
      if (!isPlainObject(u)) return fail(`${path}.upstreamArtifactRefs[] must be objects`);
      if (!isCdfCanonicalArtifactId(String(u.artifactId ?? ""))) {
        return fail(`${path}.upstreamArtifactRefs[].artifactId invalid`);
      }
      if (!Number.isInteger(u.version) || (u.version as number) < 1) {
        return fail(`${path}.upstreamArtifactRefs[].version must be integer >= 1`);
      }
      if (!isNonEmptyString(u.artifactKey)) {
        return fail(`${path}.upstreamArtifactRefs[].artifactKey required`);
      }
    }
  }
  return ok();
}

export function validatePresentationSourceData(
  data: Record<string, unknown>,
): Result {
  const leak = assertNoRendererLeak(data);
  if (!leak.ok) return leak;
  const expected = presentationSchemaId(PRESENTATION_ARTIFACT_KEYS.source);
  if (data.schemaId !== expected) {
    return fail(`schemaId must be ${expected}`);
  }
  if (data.sourceDocuments != null) {
    if (!Array.isArray(data.sourceDocuments)) {
      return fail("sourceDocuments must be an array");
    }
    const ids: string[] = [];
    for (const d of data.sourceDocuments) {
      if (!isPlainObject(d) || !isStableId(d.id)) {
        return fail("sourceDocuments[].id must be a stable id");
      }
      ids.push(d.id);
    }
    const u = assertUniqueIds(ids, "sourceDocuments");
    if (!u.ok) return u;
  }
  if (data.uploadedAssets != null) {
    if (!Array.isArray(data.uploadedAssets)) {
      return fail("uploadedAssets must be an array");
    }
    for (const a of data.uploadedAssets) {
      if (!isPlainObject(a)) return fail("uploadedAssets[] must be objects");
      const r = assertVaultAssetId(a.vaultAssetId, "uploadedAssets[].vaultAssetId");
      if (!r.ok) return r;
    }
  }
  if (data.briefRef != null && !isPlainObject(data.briefRef)) {
    return fail("briefRef must be an object");
  }
  return validateSourceRefs(data.sourceRefs, "sourceRefs");
}

export function validatePresentationStorylineData(
  data: Record<string, unknown>,
): Result {
  const leak = assertNoRendererLeak(data);
  if (!leak.ok) return leak;
  const expected = presentationSchemaId(PRESENTATION_ARTIFACT_KEYS.storyline);
  if (data.schemaId !== expected) {
    return fail(`schemaId must be ${expected}`);
  }
  if (!Array.isArray(data.sections)) return fail("sections must be an array");
  if (!Array.isArray(data.slides)) return fail("slides must be an array");
  if (data.slides.length < 1) return fail("slides must contain at least one slide intention");

  const sectionIds: string[] = [];
  for (const s of data.sections) {
    if (!isPlainObject(s)) return fail("sections[] must be objects");
    if (!isStableId(s.id)) return fail("sections[].id invalid");
    if (!isNonEmptyString(s.title)) return fail("sections[].title required");
    if (!Number.isInteger(s.order)) return fail("sections[].order must be integer");
    if (!Array.isArray(s.slideIds)) return fail("sections[].slideIds must be an array");
    sectionIds.push(s.id);
  }
  const secU = assertUniqueIds(sectionIds, "sections");
  if (!secU.ok) return secU;

  const slideIds: string[] = [];
  const orders: number[] = [];
  for (const s of data.slides) {
    if (!isPlainObject(s)) return fail("slides[] must be objects");
    if (!isStableId(s.id)) return fail("slides[].id invalid");
    if (!isNonEmptyString(s.title)) return fail("slides[].title required");
    if (!Number.isInteger(s.order)) return fail("slides[].order must be integer");
    if (s.sectionId != null && !sectionIds.includes(String(s.sectionId))) {
      return fail(`slides[].sectionId unknown: ${String(s.sectionId)}`);
    }
    slideIds.push(s.id);
    orders.push(s.order as number);
  }
  const slideU = assertUniqueIds(slideIds, "slides");
  if (!slideU.ok) return slideU;
  if (new Set(orders).size !== orders.length) {
    return fail("slides[].order must be unique");
  }

  for (const s of data.sections) {
    const sec = s as Record<string, unknown>;
    for (const sid of sec.slideIds as string[]) {
      if (!slideIds.includes(sid)) {
        return fail(`sections[].slideIds references unknown slide ${sid}`);
      }
    }
  }

  return validateSourceRefs(data.sourceRefs, "sourceRefs");
}

export function validatePresentationSlideContentData(
  data: Record<string, unknown>,
): Result {
  const leak = assertNoRendererLeak(data);
  if (!leak.ok) return leak;
  const expected = presentationSchemaId(PRESENTATION_ARTIFACT_KEYS.slideContent);
  if (data.schemaId !== expected) {
    return fail(`schemaId must be ${expected}`);
  }
  if (!Array.isArray(data.slides) || data.slides.length < 1) {
    return fail("slides must be a non-empty array");
  }

  const slideIds: string[] = [];
  const blockIds: string[] = [];
  const orders: number[] = [];
  const blockTypes = new Set([
    "heading",
    "paragraph",
    "bullets",
    "table",
    "metric",
    "quote",
    "callout",
    "image_prompt",
    "other",
  ]);

  for (const slide of data.slides) {
    if (!isPlainObject(slide)) return fail("slides[] must be objects");
    if (!isStableId(slide.id)) return fail("slides[].id invalid");
    if (!isNonEmptyString(slide.title)) return fail("slides[].title required");
    if (!Number.isInteger(slide.order)) return fail("slides[].order must be integer");
    if (!Array.isArray(slide.blocks)) return fail("slides[].blocks must be an array");
    // Reject layout coordinates on content blocks
    if ("bounds" in slide || "x" in slide) {
      return fail("slide-content must not include layout bounds (use presentation.deck)");
    }
    slideIds.push(slide.id);
    orders.push(slide.order as number);

    for (const block of slide.blocks) {
      if (!isPlainObject(block)) return fail("blocks[] must be objects");
      if (!isStableId(block.id)) return fail("blocks[].id invalid");
      if (!blockTypes.has(String(block.type))) {
        return fail(`blocks[].type invalid: ${String(block.type)}`);
      }
      if (!("content" in block)) return fail("blocks[].content required");
      if ("bounds" in block) {
        return fail("content blocks must not include bounds");
      }
      blockIds.push(block.id);
      const br = validateSourceRefs(block.sourceRefs, "blocks[].sourceRefs");
      if (!br.ok) return br;
    }
    const sr = validateSourceRefs(slide.sourceRefs, "slides[].sourceRefs");
    if (!sr.ok) return sr;
  }

  const sU = assertUniqueIds(slideIds, "slides");
  if (!sU.ok) return sU;
  const bU = assertUniqueIds(blockIds, "blocks");
  if (!bU.ok) return bU;
  if (new Set(orders).size !== orders.length) {
    return fail("slides[].order must be unique");
  }
  return validateSourceRefs(data.sourceRefs, "sourceRefs");
}

export function validatePresentationDesignRouteData(
  data: Record<string, unknown>,
): Result {
  const leak = assertNoRendererLeak(data);
  if (!leak.ok) return leak;
  const expected = presentationSchemaId(PRESENTATION_ARTIFACT_KEYS.designRoute);
  if (data.schemaId !== expected) {
    return fail(`schemaId must be ${expected}`);
  }
  if (!isStableId(data.routeId)) return fail("routeId must be a stable id");
  if (!isNonEmptyString(data.name)) return fail("name required");
  // Selection/approval must not live in schema data
  if ("selected" in data || "approved" in data || "isSelected" in data) {
    return fail("design-route must not encode selection/approval state");
  }
  if (data.representativeAssetIds != null) {
    if (!Array.isArray(data.representativeAssetIds)) {
      return fail("representativeAssetIds must be an array");
    }
    for (const id of data.representativeAssetIds) {
      const r = assertVaultAssetId(id, "representativeAssetIds[]");
      if (!r.ok) return r;
    }
  }
  return validateSourceRefs(data.sourceRefs, "sourceRefs");
}

export function validatePresentationDesignSystemData(
  data: Record<string, unknown>,
): Result {
  const leak = assertNoRendererLeak(data);
  if (!leak.ok) return leak;
  const expected = presentationSchemaId(PRESENTATION_ARTIFACT_KEYS.designSystem);
  if (data.schemaId !== expected) {
    return fail(`schemaId must be ${expected}`);
  }
  if (!isPlainObject(data.colors)) return fail("colors must be an object");
  if (!isPlainObject(data.fontRoles)) return fail("fontRoles must be an object");
  if (Object.keys(data.fontRoles).length < 1) {
    return fail("fontRoles must define at least one role");
  }
  for (const [role, def] of Object.entries(data.fontRoles)) {
    if (!isPlainObject(def) || !isNonEmptyString(def.family)) {
      return fail(`fontRoles.${role}.family required`);
    }
  }
  if (data.derivedFromRoute != null) {
    if (!isPlainObject(data.derivedFromRoute)) {
      return fail("derivedFromRoute must be an object");
    }
    if (!isCdfCanonicalArtifactId(String(data.derivedFromRoute.artifactId ?? ""))) {
      return fail("derivedFromRoute.artifactId must be a CDF artifact id");
    }
    if (
      !Number.isInteger(data.derivedFromRoute.version) ||
      (data.derivedFromRoute.version as number) < 1
    ) {
      return fail("derivedFromRoute.version must be integer >= 1");
    }
  }
  return validateSourceRefs(data.sourceRefs, "sourceRefs");
}

const ELEMENT_TYPES = new Set([
  "text",
  "image",
  "shape",
  "group",
  "table",
  "chart",
  "graphic",
]);

function validateDeckElement(
  el: unknown,
  path: string,
): Result {
  if (!isPlainObject(el)) return fail(`${path} must be an object`);
  if (!isStableId(el.id)) return fail(`${path}.id invalid`);
  if (!ELEMENT_TYPES.has(String(el.type))) {
    return fail(`${path}.type invalid: ${String(el.type)}`);
  }
  if (!isPlainObject(el.bounds)) return fail(`${path}.bounds required`);
  if (!isValidNormalizedBounds(el.bounds as never)) {
    return fail(`${path}.bounds invalid for slide_normalized coordinates`);
  }
  if (!Number.isInteger(el.zIndex)) return fail(`${path}.zIndex must be integer`);

  switch (el.type) {
    case "text":
      if (typeof el.content !== "string") return fail(`${path}.content must be string`);
      break;
    case "image": {
      const r = assertVaultAssetId(el.vaultAssetId, `${path}.vaultAssetId`);
      if (!r.ok) return r;
      break;
    }
    case "shape":
      if (!["rect", "ellipse", "line", "path", "other"].includes(String(el.shape))) {
        return fail(`${path}.shape invalid`);
      }
      break;
    case "group":
      if (!Array.isArray(el.childIds)) return fail(`${path}.childIds must be array`);
      break;
    case "table":
      if (!Array.isArray(el.rows)) return fail(`${path}.rows must be array`);
      break;
    case "chart":
      if (!isNonEmptyString(el.chartType)) return fail(`${path}.chartType required`);
      if (!isPlainObject(el.data)) return fail(`${path}.data required`);
      break;
    case "graphic":
      break;
    default:
      return fail(`${path}.type unsupported`);
  }
  return validateSourceRefs(el.sourceRefs, `${path}.sourceRefs`);
}

export function validatePresentationDeckData(
  data: Record<string, unknown>,
): Result {
  const leak = assertNoRendererLeak(data);
  if (!leak.ok) return leak;
  const expected = presentationSchemaId(PRESENTATION_ARTIFACT_KEYS.deck);
  if (data.schemaId !== expected) {
    return fail(`schemaId must be ${expected}`);
  }
  if (!isPlainObject(data.metadata)) return fail("metadata required");
  if (!isNonEmptyString(data.metadata.title)) return fail("metadata.title required");
  if (!isPlainObject(data.metadata.dimensions)) {
    return fail("metadata.dimensions required");
  }
  const dim = data.metadata.dimensions;
  if (dim.coordinateSystem !== "slide_normalized") {
    return fail('metadata.dimensions.coordinateSystem must be "slide_normalized"');
  }
  if (typeof dim.widthUnits !== "number" || typeof dim.heightUnits !== "number") {
    return fail("metadata.dimensions widthUnits/heightUnits required");
  }
  if (!isNonEmptyString(dim.aspectRatio)) {
    return fail("metadata.dimensions.aspectRatio required");
  }

  if (!isPlainObject(data.designSystemRef)) {
    return fail("designSystemRef required");
  }
  if (!isCdfCanonicalArtifactId(String(data.designSystemRef.artifactId ?? ""))) {
    return fail("designSystemRef.artifactId must be a CDF artifact id");
  }
  if (
    !Number.isInteger(data.designSystemRef.version) ||
    (data.designSystemRef.version as number) < 1
  ) {
    return fail("designSystemRef.version must be integer >= 1");
  }
  if (data.designSystemRef.artifactKey !== PRESENTATION_ARTIFACT_KEYS.designSystem) {
    return fail('designSystemRef.artifactKey must be "presentation.design-system"');
  }

  // Deck identity is not a rendered file
  if (data.renderedFileId || data.pptxFileId || data.pdfFileId) {
    return fail("DeckSpec must not use rendered file ids as deck identity");
  }

  if (!Array.isArray(data.slides) || data.slides.length < 1) {
    return fail("slides must be a non-empty array");
  }

  const slideIds: string[] = [];
  const elementIds: string[] = [];
  const orders: number[] = [];

  for (const slide of data.slides) {
    if (!isPlainObject(slide)) return fail("slides[] must be objects");
    if (!isStableId(slide.id)) return fail("slides[].id invalid");
    if (!Number.isInteger(slide.order)) return fail("slides[].order must be integer");
    if (!Array.isArray(slide.elements)) return fail("slides[].elements must be an array");
    slideIds.push(slide.id);
    orders.push(slide.order as number);

    for (const el of slide.elements) {
      const r = validateDeckElement(el, "elements[]");
      if (!r.ok) return r;
      elementIds.push((el as { id: string }).id);
    }
    const sr = validateSourceRefs(slide.sourceRefs, "slides[].sourceRefs");
    if (!sr.ok) return sr;
  }

  const sU = assertUniqueIds(slideIds, "slides");
  if (!sU.ok) return sU;
  const eU = assertUniqueIds(elementIds, "elements");
  if (!eU.ok) return eU;
  if (new Set(orders).size !== orders.length) {
    return fail("slides[].order must be unique");
  }

  return validateSourceRefs(data.sourceRefs, "sourceRefs");
}

export function validatePresentationArtifactData(
  artifactKey: PresentationArtifactKey,
  data: Record<string, unknown>,
): Result {
  switch (artifactKey) {
    case PRESENTATION_ARTIFACT_KEYS.source:
      return validatePresentationSourceData(data);
    case PRESENTATION_ARTIFACT_KEYS.storyline:
      return validatePresentationStorylineData(data);
    case PRESENTATION_ARTIFACT_KEYS.slideContent:
      return validatePresentationSlideContentData(data);
    case PRESENTATION_ARTIFACT_KEYS.designRoute:
      return validatePresentationDesignRouteData(data);
    case PRESENTATION_ARTIFACT_KEYS.designSystem:
      return validatePresentationDesignSystemData(data);
    case PRESENTATION_ARTIFACT_KEYS.deck:
      return validatePresentationDeckData(data);
    default:
      return fail(`Unknown presentation artifact key: ${String(artifactKey)}`);
  }
}
