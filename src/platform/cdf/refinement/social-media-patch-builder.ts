/**
 * M9D — Build typed Social Media patches from resolved intent.
 * Only schema-supported fields; never rewrite exact upstream refs.
 */

import { SOCIAL_MEDIA_ARTIFACT_KEYS } from "../artifacts/social-media/keys";
import { refinementError } from "./errors";
import type { ParsedSocialMediaRefinementIntent } from "./social-media-instruction-parser";
import type {
  CdfRefinementPatch,
  CdfResolvedRefinementTarget,
} from "./types";

const FORBIDDEN_FIELDS = new Set([
  "schemaId",
  "platformRef",
  "sizeReferenceRef",
  "routesRef",
  "sourceRefs",
  "selectedRouteId",
  "platformId",
  "platform",
  "optionId",
  "pathKind",
  "creativeId",
  "captionUnresolved",
  "multiAssetUnresolved",
  "elementLayoutUnresolved",
]);

const ROUTE_TEXT_FIELDS = new Set([
  "name",
  "creativeIdea",
  "visualTreatment",
  "headlineAngle",
  "rationale",
]);

const PLATFORM_TEXT_FIELDS = new Set(["label", "notes"]);

const SIZE_TEXT_FIELDS = new Set(["notes", "formatHint"]);

const CREATIVE_TEXT_FIELDS = new Set([
  "compositionNotes",
  "onImageCopy.headline",
  "onImageCopy.messageAngle",
  "onImageCopy.provenance",
]);

const ARTIFACT_TEXT_FIELDS = new Set(["label", "notes", "formatHint", "compositionNotes"]);

function assertFieldAllowed(
  entityKind: string | undefined,
  field: string | undefined,
  op: string,
): void {
  if (!field) {
    throw refinementError(
      "UNSUPPORTED_OPERATION",
      "Social Media patch requires an explicit field path",
    );
  }
  const root = field.split(".")[0]!;
  if (FORBIDDEN_FIELDS.has(root) || FORBIDDEN_FIELDS.has(field)) {
    throw refinementError(
      "UNSUPPORTED_OPERATION",
      `Cannot patch forbidden Social Media field: ${field}`,
    );
  }

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
      `Operation ${op} is not supported on Social Media structured schemas`,
    );
  }

  if (op === "SET_POSITION" || op === "SET_SIZE") {
    throw refinementError(
      "UNSUPPORTED_OPERATION",
      "SET_POSITION/SET_SIZE unsupported — on-image element layout is unresolved (M9A)",
    );
  }

  if (op === "SET_TEXT") {
    if (entityKind === "route" && !ROUTE_TEXT_FIELDS.has(field)) {
      throw refinementError(
        "UNSUPPORTED_OPERATION",
        `Route field not editable: ${field}`,
      );
    }
    if (entityKind === "platform" && !PLATFORM_TEXT_FIELDS.has(field)) {
      throw refinementError(
        "UNSUPPORTED_OPERATION",
        `Platform field not editable: ${field}`,
      );
    }
    if (entityKind === "size" && !SIZE_TEXT_FIELDS.has(field)) {
      throw refinementError(
        "UNSUPPORTED_OPERATION",
        `Size-reference field not editable: ${field}`,
      );
    }
    if (
      entityKind === "creative" &&
      !CREATIVE_TEXT_FIELDS.has(field) &&
      field !== "compositionNotes"
    ) {
      throw refinementError(
        "UNSUPPORTED_OPERATION",
        `Creative field not editable: ${field}`,
      );
    }
    if (
      entityKind === "artifact" &&
      !ARTIFACT_TEXT_FIELDS.has(field) &&
      !CREATIVE_TEXT_FIELDS.has(field)
    ) {
      throw refinementError(
        "UNSUPPORTED_OPERATION",
        `Artifact field not editable: ${field}`,
      );
    }
  }
}

export function buildSocialMediaRefinementPatch(input: {
  data: Record<string, unknown>;
  intent: ParsedSocialMediaRefinementIntent;
  target: CdfResolvedRefinementTarget;
}): CdfRefinementPatch {
  const { intent, target } = input;
  const op = intent.op;
  if (!op) {
    throw refinementError("UNSUPPORTED_OPERATION", "No Social Media patch op");
  }
  if (intent.unsupported) {
    throw refinementError(
      "UNSUPPORTED_OPERATION",
      intent.unsupportedReason ?? "Unsupported Social Media refinement",
    );
  }

  const field = intent.field ?? target.fieldPath;
  assertFieldAllowed(intent.entityKind ?? target.entityKind, field, op);

  if (op === "REPLACE_ASSET") {
    if (
      target.artifactKey !== SOCIAL_MEDIA_ARTIFACT_KEYS.output &&
      target.artifactKey !== SOCIAL_MEDIA_ARTIFACT_KEYS.sizeReference
    ) {
      throw refinementError(
        "UNSUPPORTED_OPERATION",
        "REPLACE_ASSET only supported on social-media.output / size-reference Vault refs",
      );
    }
    if (intent.value == null) {
      throw refinementError(
        "INVALID_PATCH",
        "REPLACE_ASSET requires vault asset id",
      );
    }
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
