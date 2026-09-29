/**
 * M8D — Packaging refinement instruction parser.
 * Deterministic; never invents structured elements from rasters/OCR.
 */

import type { CdfPatchOp } from "./types";

export type PackagingEntityKind =
  | "artifact"
  | "panel"
  | "route"
  | "direction"
  | "surface"
  | "view"
  | "sku"
  | "asset";

export type ParsedPackagingRefinementIntent = {
  op?: CdfPatchOp;
  entityKind?: PackagingEntityKind;
  entityId?: string;
  /** Dot path within entity, e.g. name, compositionNotes, camera.azimuthDeg */
  field?: string;
  value?: unknown;
  textValue?: string;
  ambiguous: boolean;
  ambiguityReason?: string;
  unsupported?: boolean;
  unsupportedReason?: string;
  /** Prefer inventing structured logo/elements from raster */
  inventElement?: boolean;
};

const STABLE_ID_RE = /^[a-zA-Z][a-zA-Z0-9._-]{0,127}$/;

const FORBIDDEN_INTENT =
  /\b(ocr|mesh|geometry|cut\s*path|fold\s*path|scene\s*graph|logo\s+element|invent)\b/i;

const RASTER_LOGO =
  /\b(logo|claim)\b.*\b(larger|bigger|move|left|right|up|down|20\s*mm)\b|\bmove\b.*\blogo\b|\bmake\b.*\blogo\b/i;

const ADD_SKU = /\b(add|create|another)\b.*\bsku\b/i;

/**
 * Parse preferredTargetPath forms:
 *   route_01.name
 *   sku_01.label
 *   direction_01.visualIntent
 *   dieline_panel_01.name
 *   package_surface_front.compositionNotes
 *   view_01.camera.azimuthDeg
 *   front.previewAssetRef
 *   artifact.packageType
 */
export function parsePackagingTargetPath(
  path: string,
): { entityId?: string; entityKind?: PackagingEntityKind; field?: string } {
  const p = path.trim();
  if (!p) return {};

  if (p.startsWith("artifact.")) {
    return { entityKind: "artifact", field: p.slice("artifact.".length) };
  }
  if (p === "front" || p.startsWith("front.")) {
    return {
      entityKind: "surface",
      entityId: "package_surface_front",
      field: p === "front" ? undefined : p.slice("front.".length),
    };
  }

  const dot = p.indexOf(".");
  const id = dot >= 0 ? p.slice(0, dot) : p;
  const field = dot >= 0 ? p.slice(dot + 1) : undefined;
  if (!STABLE_ID_RE.test(id)) return {};

  let entityKind: PackagingEntityKind | undefined;
  if (id.startsWith("dieline_panel_") || id.startsWith("panel_")) {
    entityKind = "panel";
  } else if (id.startsWith("route_")) {
    entityKind = "route";
  } else if (id.startsWith("direction_")) {
    entityKind = "direction";
  } else if (id.startsWith("package_surface_") || id.startsWith("surface_")) {
    entityKind = "surface";
  } else if (id.startsWith("view_")) {
    entityKind = "view";
  } else if (id.startsWith("sku_")) {
    entityKind = "sku";
  }

  return { entityId: id, entityKind, field };
}

export function parsePackagingRefinementInstruction(
  raw: string,
  preferredTargetPath?: string,
): ParsedPackagingRefinementIntent {
  const text = raw.trim();

  if (FORBIDDEN_INTENT.test(text) && /\b(ocr|invent)\b/i.test(text)) {
    return {
      unsupported: true,
      unsupportedReason:
        "OCR / invented structure is not canonical Packaging truth",
      ambiguous: false,
    };
  }

  if (RASTER_LOGO.test(text)) {
    return {
      unsupported: true,
      unsupportedReason:
        "Raster-only Packaging artifacts have no structured logo element — targeted structural refinement unsupported (do not invent elements)",
      ambiguous: false,
      inventElement: true,
    };
  }

  if (ADD_SKU.test(text)) {
    return {
      unsupported: true,
      unsupportedReason:
        "Creating another SKU is a Packaging workflow action, not a targeted patch",
      ambiguous: false,
    };
  }

  if (/\b(geometry|cut\s*path|fold\s*path|mesh|scene\s*graph)\b/i.test(text)) {
    return {
      unsupported: true,
      unsupportedReason:
        "Structured dieline geometry / 3D scene graph is unresolved — geometry patches unsupported",
      ambiguous: false,
    };
  }

  const fromPath = preferredTargetPath
    ? parsePackagingTargetPath(preferredTargetPath)
    : {};

  // set <id> <field> to '...'
  const setField =
    text.match(
      /(?:set|change|update)\s+([a-zA-Z][a-zA-Z0-9._-]*)\s+([a-zA-Z][a-zA-Z0-9._]*)\s+to\s+['"](.+?)['"]\s*[.!]?\s*$/i,
    ) ||
    text.match(
      /(?:set|change|update)\s+(?:the\s+)?([a-zA-Z][a-zA-Z0-9._]*)\s+to\s+['"](.+?)['"]\s*[.!]?\s*$/i,
    );

  if (setField) {
    if (setField.length === 4) {
      const entityId = setField[1];
      const field = setField[2];
      const value = setField[3];
      const kind =
        fromPath.entityKind ??
        parsePackagingTargetPath(entityId).entityKind ??
        parsePackagingTargetPath(`${entityId}.${field}`).entityKind;
      return {
        op: "SET_TEXT",
        entityKind: kind,
        entityId:
          fromPath.entityId ??
          (kind === "surface" && entityId === "front"
            ? "package_surface_front"
            : entityId),
        field,
        textValue: value,
        value,
        ambiguous: !kind,
        ambiguityReason: !kind ? "AMBIGUOUS_TARGET" : undefined,
      };
    }
    // set <field> to '...' with preferred path for entity
    const field = setField[1];
    const value = setField[2];
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

  // replace preview/asset with ObjectId
  const replaceAsset = text.match(
    /replace\s+(?:the\s+)?(?:preview\s+)?(?:asset|image)\s+(?:with|to)\s+([a-fA-F0-9]{24}|art_\S+|exec_\S+|cdfart_\S+|https?:\S+)/i,
  );
  if (replaceAsset || (fromPath.field === "previewAssetRef" && fromPath.entityId)) {
    const idMatch =
      replaceAsset?.[1] ??
      text.match(/\b([a-fA-F0-9]{24})\b/)?.[1] ??
      text.match(/\b(art_\S+|exec_\S+|cdfart_\S+)\b/)?.[1];
    return {
      op: "REPLACE_ASSET",
      entityKind: fromPath.entityKind ?? "asset",
      entityId: fromPath.entityId,
      field: "previewAssetRef",
      value: idMatch,
      ambiguous: !fromPath.entityId,
      ambiguityReason: !fromPath.entityId ? "AMBIGUOUS_TARGET" : undefined,
    };
  }

  // camera numeric: set view_01 camera azimuth to 40
  const cam = text.match(
    /(?:set|change)\s+([a-zA-Z][a-zA-Z0-9._-]*)\s+camera\s+(azimuth|elevation|distance)(?:Deg|Hint)?\s+to\s+(-?\d+(?:\.\d+)?)/i,
  );
  if (cam) {
    const fieldMap: Record<string, string> = {
      azimuth: "camera.azimuthDeg",
      elevation: "camera.elevationDeg",
      distance: "camera.distanceHint",
    };
    return {
      op: "SET_POSITION",
      entityKind: "view",
      entityId: cam[1],
      field: fieldMap[cam[2].toLowerCase()] ?? `camera.${cam[2]}`,
      value: Number(cam[3]),
      ambiguous: false,
    };
  }

  // panel bounds size/position when preferred path present
  if (
    fromPath.entityKind === "panel" &&
    fromPath.field &&
    /bounds|position|size/i.test(fromPath.field + text)
  ) {
    const nums = text.match(/(-?\d+(?:\.\d+)?)/g);
    if (/position|move|bounds\.x|bounds\.y/i.test(text + (fromPath.field ?? ""))) {
      return {
        op: "SET_POSITION",
        entityKind: "panel",
        entityId: fromPath.entityId,
        field: fromPath.field.startsWith("bounds")
          ? fromPath.field
          : "bounds",
        value: nums
          ? { x: Number(nums[0]), y: Number(nums[1] ?? nums[0]) }
          : undefined,
        ambiguous: !nums,
        ambiguityReason: !nums ? "AMBIGUOUS_TARGET" : undefined,
      };
    }
    if (/size|bounds\.width|bounds\.height/i.test(text + (fromPath.field ?? ""))) {
      return {
        op: "SET_SIZE",
        entityKind: "panel",
        entityId: fromPath.entityId,
        field: fromPath.field.startsWith("bounds")
          ? fromPath.field
          : "bounds",
        value: nums
          ? { width: Number(nums[0]), height: Number(nums[1] ?? nums[0]) }
          : undefined,
        ambiguous: !nums,
      };
    }
  }

  // Preferred path alone with quoted value in instruction
  if (fromPath.entityId || fromPath.entityKind === "artifact") {
    const quoted = text.match(/['"](.+?)['"]/);
    if (quoted && fromPath.field) {
      return {
        op: "SET_TEXT",
        entityKind: fromPath.entityKind,
        entityId: fromPath.entityId,
        field: fromPath.field,
        textValue: quoted[1],
        value: quoted[1],
        ambiguous: false,
      };
    }
    if (fromPath.field && quoted == null && /replace|asset|preview/i.test(text)) {
      return {
        op: "REPLACE_ASSET",
        entityKind: fromPath.entityKind,
        entityId: fromPath.entityId,
        field: fromPath.field,
        ambiguous: true,
        ambiguityReason: "AMBIGUOUS_TARGET",
      };
    }
  }

  // Index-only targets rejected
  if (/\b(index|array\s*index|#\d+|nth)\b/i.test(text)) {
    return {
      unsupported: true,
      unsupportedReason:
        "Array-index-only targeting is rejected — use stable Packaging IDs",
      ambiguous: false,
    };
  }

  if (fromPath.entityId && !fromPath.field) {
    return {
      ambiguous: true,
      ambiguityReason: "AMBIGUOUS_TARGET",
      entityKind: fromPath.entityKind,
      entityId: fromPath.entityId,
    };
  }

  return {
    unsupported: true,
    unsupportedReason:
      "Packaging refinement instruction could not be mapped to a structured field patch (no silent full regeneration)",
    ambiguous: false,
  };
}
