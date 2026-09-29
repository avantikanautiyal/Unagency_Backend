/**
 * M8D — Build typed Packaging patches from resolved intent.
 * Only schema-supported fields; never rewrite exact upstream refs.
 */

import { PACKAGING_ARTIFACT_KEYS } from "../artifacts/packaging/keys";
import { refinementError } from "./errors";
import type { ParsedPackagingRefinementIntent } from "./packaging-instruction-parser";
import type {
  CdfRefinementPatch,
  CdfResolvedRefinementTarget,
} from "./types";

const FORBIDDEN_FIELDS = new Set([
  "schemaId",
  "dielineRef",
  "routesRef",
  "threeDDirectionRef",
  "frontPackRef",
  "completePackRef",
  "viewsRef",
  "geometryUnresolved",
  "structuredSceneUnresolved",
  "sourceRefs",
]);

const ROUTE_TEXT_FIELDS = new Set([
  "name",
  "shelfIdea",
  "hierarchyThought",
  "visualDirection",
  "designRationale",
  "typographyDirection",
  "colorDirection",
  "imageryDirection",
  "packagingApplicationNotes",
]);

const DIRECTION_TEXT_FIELDS = new Set([
  "name",
  "visualIntent",
  "packageFormNotes",
  "cameraNotes",
  "lightingNotes",
  "materialNotes",
]);

const FRONT_TEXT_FIELDS = new Set([
  "compositionNotes",
  "brandLockupNotes",
  "variantNameNotes",
  "frontId",
]);

const SKU_TEXT_FIELDS = new Set([
  "label",
  "variantName",
  "variantAttribute",
  "artworkOverrideNotes",
]);

const VIEW_TEXT_FIELDS = new Set(["name", "purpose"]);

const ARTIFACT_TEXT_FIELDS = new Set([
  "packageType",
  "pathKind",
  "technicalNotes",
]);

function assertFieldAllowed(
  artifactKey: string,
  entityKind: string | undefined,
  field: string | undefined,
  op: string,
): void {
  if (!field) {
    throw refinementError(
      "UNSUPPORTED_OPERATION",
      "Packaging patch requires an explicit field path",
    );
  }
  const root = field.split(".")[0]!;
  if (FORBIDDEN_FIELDS.has(root) || FORBIDDEN_FIELDS.has(field)) {
    throw refinementError(
      "UNSUPPORTED_OPERATION",
      `Cannot patch forbidden Packaging field: ${field}`,
    );
  }

  // Font / typography ops — Packaging schema has no fontSize fields
  if (
    op.startsWith("SET_FONT") ||
    op === "SET_TEXT_COLOR" ||
    op === "SET_ALIGNMENT" ||
    op === "SET_LINE_HEIGHT" ||
    op === "SET_LETTER_SPACING" ||
    op === "SET_BORDER" ||
    op === "SET_FILL" ||
    op === "SET_BACKGROUND" ||
    op === "SET_OPACITY" ||
    op === "SET_ROTATION" ||
    op === "SET_VISIBILITY"
  ) {
    throw refinementError(
      "UNSUPPORTED_OPERATION",
      `Operation ${op} is not supported on Packaging structured schemas (no typography/layout element model)`,
    );
  }

  if (entityKind === "route" && !ROUTE_TEXT_FIELDS.has(field) && op === "SET_TEXT") {
    throw refinementError(
      "UNSUPPORTED_OPERATION",
      `Route field not editable: ${field}`,
    );
  }
  if (
    entityKind === "direction" &&
    !DIRECTION_TEXT_FIELDS.has(field) &&
    op === "SET_TEXT"
  ) {
    throw refinementError(
      "UNSUPPORTED_OPERATION",
      `Direction field not editable: ${field}`,
    );
  }
  if (
    entityKind === "surface" &&
    artifactKey === PACKAGING_ARTIFACT_KEYS.frontPack &&
    !FRONT_TEXT_FIELDS.has(field) &&
    field !== "previewAssetRef" &&
    field !== "mandatoryCopy" &&
    op !== "REPLACE_ASSET"
  ) {
    if (op === "SET_TEXT" && !FRONT_TEXT_FIELDS.has(field)) {
      throw refinementError(
        "UNSUPPORTED_OPERATION",
        `Front-pack field not editable: ${field}`,
      );
    }
  }
  if (entityKind === "sku" && !SKU_TEXT_FIELDS.has(field) && field !== "previewAssetRef") {
    throw refinementError(
      "UNSUPPORTED_OPERATION",
      `SKU field not editable: ${field}`,
    );
  }
  if (
    entityKind === "view" &&
    !VIEW_TEXT_FIELDS.has(field) &&
    !field.startsWith("camera.") &&
    field !== "previewAssetRef" &&
    field !== "camera"
  ) {
    throw refinementError(
      "UNSUPPORTED_OPERATION",
      `View field not editable: ${field}`,
    );
  }
  if (
    entityKind === "artifact" &&
    !ARTIFACT_TEXT_FIELDS.has(field) &&
    field !== "packageType"
  ) {
    throw refinementError(
      "UNSUPPORTED_OPERATION",
      `Artifact field not editable: ${field}`,
    );
  }
}

export function buildPackagingRefinementPatch(input: {
  data: Record<string, unknown>;
  intent: ParsedPackagingRefinementIntent;
  target: CdfResolvedRefinementTarget;
}): CdfRefinementPatch {
  const { intent, target, data } = input;
  const op = intent.op;
  if (!op) {
    throw refinementError("UNSUPPORTED_OPERATION", "No Packaging patch op");
  }
  if (intent.unsupported) {
    throw refinementError(
      "UNSUPPORTED_OPERATION",
      intent.unsupportedReason ?? "Unsupported Packaging refinement",
    );
  }

  const field = intent.field ?? target.fieldPath;
  assertFieldAllowed(target.artifactKey, intent.entityKind ?? target.entityKind, field, op);

  // Geometry: reject panel bounds when geometryUnresolved and op is position/size
  if (
    (op === "SET_POSITION" || op === "SET_SIZE") &&
    intent.entityKind === "panel"
  ) {
    if (data.geometryUnresolved === true) {
      throw refinementError(
        "UNSUPPORTED_OPERATION",
        "Cannot patch dieline panel geometry while geometryUnresolved — not fabricated",
      );
    }
    const panel = (data.panels as Array<{ id: string; bounds?: unknown }> | undefined)?.find(
      (p) => p.id === intent.entityId,
    );
    if (!panel?.bounds && field?.startsWith("bounds")) {
      throw refinementError(
        "UNSUPPORTED_OPERATION",
        "Panel has no structured bounds — cannot invent geometry",
      );
    }
  }

  // Camera: reject inventing camera object
  if (field?.startsWith("camera")) {
    const view = (data.views as Array<{ id: string; camera?: unknown }> | undefined)?.find(
      (v) => v.id === intent.entityId,
    );
    if (!view?.camera) {
      throw refinementError(
        "UNSUPPORTED_OPERATION",
        "View has no camera metadata — cannot invent camera fields",
      );
    }
  }

  // 3D scene: no geometry ops
  if (
    target.artifactKey === PACKAGING_ARTIFACT_KEYS.threeDDirection &&
    (op === "SET_POSITION" || op === "SET_SIZE" || op === "SET_ROTATION")
  ) {
    throw refinementError(
      "UNSUPPORTED_OPERATION",
      "3D direction has no structured scene graph — geometry patches unsupported",
    );
  }

  if (op === "REPLACE_ASSET" && intent.value == null) {
    throw refinementError("INVALID_PATCH", "REPLACE_ASSET requires vault asset id");
  }

  if (op === "SET_TEXT" && intent.value == null && intent.textValue == null) {
    throw refinementError("INVALID_PATCH", "SET_TEXT requires a value");
  }

  return {
    scope: "property",
    operations: [
      {
        op,
        target: {
          entityId: intent.entityId ?? target.entityId,
          entityKind: intent.entityKind ?? target.entityKind,
          fieldPath: field,
        },
        value: intent.value ?? intent.textValue,
        property: field,
      },
    ],
  };
}
