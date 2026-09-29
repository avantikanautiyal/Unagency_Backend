/**
 * M9D — Social Media refinement instruction parser.
 * Deterministic; never invents on-image layout from rasters/OCR.
 */

import type { CdfPatchOp } from "./types";

export type SocialMediaEntityKind =
  | "artifact"
  | "route"
  | "creative"
  | "platform"
  | "size"
  | "asset";

export type ParsedSocialMediaRefinementIntent = {
  op?: CdfPatchOp;
  entityKind?: SocialMediaEntityKind;
  entityId?: string;
  field?: string;
  value?: unknown;
  textValue?: string;
  ambiguous: boolean;
  ambiguityReason?: string;
  unsupported?: boolean;
  unsupportedReason?: string;
  inventElement?: boolean;
};

const STABLE_ID_RE = /^[a-zA-Z][a-zA-Z0-9._-]{0,127}$/;

const RASTER_LAYOUT =
  /\b(logo|product|person|image|photo|raster)\b.*\b(larger|bigger|move|left|right|up|down|20\s*px|10\s*%|smaller)\b|\bmove\b.*\b(logo|headline|product)\b|\bmake\b.*\b(logo|product)\b.*\b(bigger|larger)\b/i;

const GEOMETRY =
  /\b(geometry|pixel\s*position|bounding\s*box|ocr|invent\s+layout|on-?image\s+layout)\b/i;

const FULL_REGEN =
  /\b(regenerate|full\s+regen|new\s+creative\s+from\s+scratch|generate\s+another\s+image)\b/i;

/**
 * Parse preferredTargetPath forms:
 *   route_02.headlineAngle
 *   creative_01.onImageCopy.headline
 *   artifact.label
 *   platform_instagram.notes
 *   size_option_enter.formatHint
 *   creative_01.previewAssetRef
 */
export function parseSocialMediaTargetPath(
  path: string,
): { entityId?: string; entityKind?: SocialMediaEntityKind; field?: string } {
  const p = path.trim();
  if (!p) return {};

  if (p.startsWith("artifact.")) {
    return { entityKind: "artifact", field: p.slice("artifact.".length) };
  }

  const dot = p.indexOf(".");
  const id = dot >= 0 ? p.slice(0, dot) : p;
  const field = dot >= 0 ? p.slice(dot + 1) : undefined;
  if (!STABLE_ID_RE.test(id)) return {};

  let entityKind: SocialMediaEntityKind | undefined;
  if (id.startsWith("route_")) entityKind = "route";
  else if (id.startsWith("creative_")) entityKind = "creative";
  else if (id.startsWith("platform_")) entityKind = "platform";
  else if (id.startsWith("size_option_") || id.startsWith("size_")) {
    entityKind = "size";
  }

  return { entityId: id, entityKind, field };
}

export function parseSocialMediaRefinementInstruction(
  raw: string,
  preferredTargetPath?: string,
): ParsedSocialMediaRefinementIntent {
  const text = raw.trim();

  if (GEOMETRY.test(text) || /\b(ocr|invent)\b/i.test(text)) {
    return {
      unsupported: true,
      unsupportedReason:
        "On-image element layout / OCR / invented geometry is unresolved — targeted structural refinement unsupported",
      ambiguous: false,
      inventElement: true,
    };
  }

  if (RASTER_LAYOUT.test(text)) {
    return {
      unsupported: true,
      unsupportedReason:
        "Raster-only Social Media creatives have no structured element bounds — do not invent positions/sizes (no full-generation fallback)",
      ambiguous: false,
      inventElement: true,
    };
  }

  if (FULL_REGEN.test(text)) {
    return {
      unsupported: true,
      unsupportedReason:
        "Full creative regeneration is not targeted refinement — unsupported in M9D",
      ambiguous: false,
    };
  }

  if (
    /\b(font|typography|text\s*color|alignment|opacity|rotation|visibility|border|fill)\b/i.test(
      text,
    )
  ) {
    return {
      unsupported: true,
      unsupportedReason:
        "Typography/layout element ops are not supported on Social Media structured schemas",
      ambiguous: false,
    };
  }

  const fromPath = preferredTargetPath
    ? parseSocialMediaTargetPath(preferredTargetPath)
    : {};

  // set route_02 headlineAngle to '...'
  const setField =
    text.match(
      /(?:set|change|update)\s+([a-zA-Z][a-zA-Z0-9._-]*)\s+([a-zA-Z][a-zA-Z0-9._]*)\s+to\s+['"](.+?)['"]\s*[.!]?\s*$/i,
    ) ||
    text.match(
      /(?:set|change|update)\s+(?:the\s+)?([a-zA-Z][a-zA-Z0-9._]*)\s+to\s+['"](.+?)['"]\s*[.!]?\s*$/i,
    );

  if (setField) {
    if (setField.length === 4) {
      const entityId = setField[1]!;
      const field = setField[2]!;
      const value = setField[3]!;
      const kind =
        fromPath.entityKind ??
        parseSocialMediaTargetPath(entityId).entityKind ??
        parseSocialMediaTargetPath(`${entityId}.${field}`).entityKind;
      return {
        op: "SET_TEXT",
        entityKind: kind,
        entityId: fromPath.entityId ?? entityId,
        field: fromPath.field ?? field,
        textValue: value,
        value,
        ambiguous: !kind,
        ambiguityReason: !kind ? "AMBIGUOUS_TARGET" : undefined,
      };
    }
    const field = setField[1]!;
    const value = setField[2]!;
    if (fromPath.entityId || fromPath.entityKind === "artifact") {
      return {
        op: "SET_TEXT",
        entityKind: fromPath.entityKind,
        entityId: fromPath.entityId,
        field: fromPath.field ?? field,
        textValue: value,
        value,
        ambiguous: false,
      };
    }
    return {
      ambiguous: true,
      ambiguityReason: "AMBIGUOUS_TARGET",
      field,
      textValue: value,
      value,
      op: "SET_TEXT",
    };
  }

  // "Give me another headline" with preferred creative path
  if (/\b(headline|message\s*angle)\b/i.test(text) && fromPath.entityId) {
    const field = /\bmessage\s*angle\b/i.test(text)
      ? "onImageCopy.messageAngle"
      : "onImageCopy.headline";
    const quoted = text.match(/['"](.+?)['"]/);
    return {
      op: "SET_TEXT",
      entityKind: fromPath.entityKind ?? "creative",
      entityId: fromPath.entityId,
      field: fromPath.field ?? field,
      textValue: quoted?.[1],
      value: quoted?.[1],
      ambiguous: !quoted?.[1],
      ambiguityReason: !quoted?.[1]
        ? "AMBIGUOUS_TARGET"
        : undefined,
    };
  }

  // Ordinal / vague route targeting without stable id → clarification
  if (
    /\b(second|first|third|2nd|1st|3rd)\b.*\b(direction|route|headline)\b/i.test(
      text,
    ) &&
    !fromPath.entityId
  ) {
    return {
      ambiguous: true,
      ambiguityReason: "AMBIGUOUS_TARGET",
      op: "SET_TEXT",
    };
  }

  // replace preview/asset
  const replaceAsset = text.match(
    /replace\s+(?:the\s+)?(?:preview\s+)?(?:asset|image)\s+(?:with|to)\s+([a-fA-F0-9]{24}|art_\S+|exec_\S+|cdfart_\S+|https?:\S+)/i,
  );
  if (
    replaceAsset ||
    (fromPath.field === "previewAssetRef" &&
      (fromPath.entityId || fromPath.entityKind === "creative"))
  ) {
    const idMatch =
      replaceAsset?.[1] ??
      text.match(/\b([a-fA-F0-9]{24})\b/)?.[1] ??
      text.match(/\b(art_\S+|exec_\S+|cdfart_\S+)\b/)?.[1];
    return {
      op: "REPLACE_ASSET",
      entityKind: fromPath.entityKind ?? "creative",
      entityId: fromPath.entityId,
      field: "previewAssetRef",
      value: idMatch,
      ambiguous: !fromPath.entityId && fromPath.entityKind !== "creative",
      ambiguityReason:
        !fromPath.entityId && fromPath.entityKind !== "creative"
          ? "AMBIGUOUS_TARGET"
          : undefined,
    };
  }

  if (fromPath.entityId || fromPath.entityKind === "artifact") {
    return {
      ambiguous: true,
      ambiguityReason: "AMBIGUOUS_TARGET",
      entityKind: fromPath.entityKind,
      entityId: fromPath.entityId,
      field: fromPath.field,
    };
  }

  return {
    ambiguous: true,
    ambiguityReason: "AMBIGUOUS_TARGET",
  };
}
