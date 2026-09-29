/**
 * M8D — Apply Packaging patches on a cloned payload (source immutable).
 */

import { refinementError } from "./errors";
import type {
  CdfRefinementChange,
  CdfRefinementPatch,
} from "./types";

function cloneData<T>(data: T): T {
  return structuredClone(data);
}

function getByPath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function setByPath(
  obj: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  const parts = path.split(".");
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i]!;
    const next = cur[p];
    if (next == null || typeof next !== "object") {
      cur[p] = {};
    }
    cur = cur[p] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]!] = value;
}

function findEntity(
  data: Record<string, unknown>,
  kind: string | undefined,
  id: string | undefined,
): Record<string, unknown> | null {
  if (kind === "artifact" || !id) return data;
  if (kind === "panel") {
    return (
      (data.panels as Record<string, unknown>[] | undefined)?.find(
        (p) => p.id === id,
      ) ?? null
    );
  }
  if (kind === "route") {
    return (
      (data.routes as Record<string, unknown>[] | undefined)?.find(
        (r) => r.routeId === id,
      ) ?? null
    );
  }
  if (kind === "direction") {
    return (
      (data.candidates as Record<string, unknown>[] | undefined)?.find(
        (c) => c.id === id,
      ) ?? null
    );
  }
  if (kind === "surface") {
    if (data.frontId === id) return data;
    return (
      (data.surfaces as Record<string, unknown>[] | undefined)?.find(
        (s) => s.id === id,
      ) ?? null
    );
  }
  if (kind === "view") {
    return (
      (data.views as Record<string, unknown>[] | undefined)?.find(
        (v) => v.id === id,
      ) ?? null
    );
  }
  if (kind === "sku") {
    return (
      (data.skus as Record<string, unknown>[] | undefined)?.find(
        (s) => s.id === id,
      ) ?? null
    );
  }
  return null;
}

export function applyPackagingRefinementPatch(
  source: Record<string, unknown>,
  patch: CdfRefinementPatch,
): { data: Record<string, unknown>; changes: CdfRefinementChange[] } {
  if (!patch.operations.length) {
    throw refinementError("INVALID_PATCH", "Packaging patch has no operations");
  }

  const data = cloneData(source);
  const changes: CdfRefinementChange[] = [];

  for (const op of patch.operations) {
    const entity = findEntity(
      data,
      op.target.entityKind,
      op.target.entityId,
    );
    if (!entity) {
      throw refinementError(
        "TARGET_NOT_FOUND",
        `Entity missing for Packaging patch: ${op.target.entityId}`,
      );
    }

    const field = op.target.fieldPath ?? op.property;
    if (!field) {
      throw refinementError("INVALID_PATCH", "Missing fieldPath");
    }

    if (op.op === "SET_TEXT") {
      const from = getByPath(entity, field);
      if (field === "mandatoryCopy" && typeof op.value === "string") {
        setByPath(entity, field, [op.value]);
      } else if (field === "technicalNotes" && typeof op.value === "string") {
        setByPath(entity, field, [op.value]);
      } else {
        setByPath(entity, field, op.value);
      }
      changes.push({
        property: field,
        path: `${op.target.entityId ?? "artifact"}.${field}`,
        from,
        to: getByPath(entity, field),
      });
      continue;
    }

    if (op.op === "REPLACE_ASSET") {
      const vaultAssetId = String(op.value);
      const from = entity.previewAssetRef;
      entity.previewAssetRef = {
        ...(typeof from === "object" && from ? from : {}),
        vaultAssetId,
        role:
          typeof from === "object" && from && "role" in from
            ? (from as { role?: string }).role
            : "preview",
      };
      changes.push({
        property: "previewAssetRef",
        path: `${op.target.entityId ?? "artifact"}.previewAssetRef`,
        from,
        to: entity.previewAssetRef,
      });
      continue;
    }

    if (op.op === "SET_POSITION" || op.op === "SET_SIZE") {
      if (field.startsWith("camera.")) {
        const from = getByPath(entity, field);
        setByPath(entity, field, op.value);
        changes.push({
          property: field,
          path: `${op.target.entityId}.${field}`,
          from,
          to: op.value,
        });
        continue;
      }
      if (field === "bounds" || field.startsWith("bounds.")) {
        const bounds = {
          ...((entity.bounds as Record<string, unknown>) ?? {}),
        };
        const from = structuredClone(bounds);
        const v = op.value as Record<string, number>;
        if (op.op === "SET_POSITION") {
          if (v.x != null) bounds.x = v.x;
          if (v.y != null) bounds.y = v.y;
        } else {
          if (v.width != null) bounds.width = v.width;
          if (v.height != null) bounds.height = v.height;
        }
        entity.bounds = bounds;
        changes.push({
          property: "bounds",
          path: `${op.target.entityId}.bounds`,
          from,
          to: bounds,
        });
        continue;
      }
      throw refinementError(
        "UNSUPPORTED_OPERATION",
        `SET_POSITION/SIZE not applicable to field ${field}`,
      );
    }

    throw refinementError(
      "UNSUPPORTED_OPERATION",
      `Packaging patch op not applied: ${op.op}`,
    );
  }

  return { data, changes };
}
