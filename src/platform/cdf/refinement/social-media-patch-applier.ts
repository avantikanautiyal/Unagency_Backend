/**
 * M9D — Apply Social Media patches on a cloned payload (source immutable).
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
  if (kind === "artifact" || !kind) return data;
  if (kind === "route") {
    if (!id) return null;
    return (
      (data.routes as Record<string, unknown>[] | undefined)?.find(
        (r) => r.routeId === id,
      ) ?? null
    );
  }
  if (kind === "creative") {
    if (id && data.creativeId !== id) return null;
    return data;
  }
  if (kind === "platform") {
    if (id && data.platformId !== id) return null;
    return data;
  }
  if (kind === "size") {
    if (id && data.optionId !== id) return null;
    return data;
  }
  if (kind === "asset") return data;
  return null;
}

export function applySocialMediaRefinementPatch(
  source: Record<string, unknown>,
  patch: CdfRefinementPatch,
): { data: Record<string, unknown>; changes: CdfRefinementChange[] } {
  if (!patch.operations.length) {
    throw refinementError(
      "INVALID_PATCH",
      "Social Media patch has no operations",
    );
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
        `Entity missing for Social Media patch: ${op.target.entityId}`,
      );
    }

    const field = op.target.fieldPath ?? op.property;
    if (!field) {
      throw refinementError("INVALID_PATCH", "Missing fieldPath");
    }

    if (op.op === "SET_TEXT") {
      const from = getByPath(entity, field);
      setByPath(entity, field, op.value);
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
      if (field === "previewAssetRef" || !field) {
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
      throw refinementError(
        "UNSUPPORTED_OPERATION",
        `REPLACE_ASSET not applicable to field ${field}`,
      );
    }

    if (op.op === "SET_POSITION" || op.op === "SET_SIZE") {
      throw refinementError(
        "UNSUPPORTED_OPERATION",
        "SET_POSITION/SET_SIZE unsupported on Social Media — element layout unresolved",
      );
    }

    throw refinementError(
      "UNSUPPORTED_OPERATION",
      `Social Media patch op not applied: ${op.op}`,
    );
  }

  return { data, changes };
}
