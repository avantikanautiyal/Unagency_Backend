/**
 * M9D — Social Media patch isolation: only targeted entity+field may change;
 * exact upstream refs and schema identity must be preserved.
 */

import { refinementError } from "./errors";
import type { CdfRefinementPatch } from "./types";

const PROTECTED_ROOT_KEYS = [
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
] as const;

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function allowedPaths(patch: CdfRefinementPatch): Set<string> {
  const set = new Set<string>();
  for (const op of patch.operations) {
    const id = op.target.entityId ?? "artifact";
    const field = op.target.fieldPath ?? op.property ?? "";
    set.add(`${id}.${field}`);
    if (field === "previewAssetRef") set.add(`${id}.previewAssetRef`);
    if (field.startsWith("onImageCopy.")) set.add(`${id}.onImageCopy`);
  }
  return set;
}

export function assertSocialMediaIsolation(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  patch: CdfRefinementPatch,
): void {
  for (const key of PROTECTED_ROOT_KEYS) {
    if (!deepEqual(before[key], after[key])) {
      throw refinementError(
        "ISOLATION_VIOLATION",
        `Protected Social Media field mutated: ${key}`,
      );
    }
  }

  const allowed = allowedPaths(patch);

  const beforeRoutes = before.routes as Array<Record<string, unknown>> | undefined;
  const afterRoutes = after.routes as Array<Record<string, unknown>> | undefined;
  if ((beforeRoutes?.length ?? 0) !== (afterRoutes?.length ?? 0)) {
    throw refinementError(
      "ISOLATION_VIOLATION",
      "Social Media routes cardinality changed during refinement",
    );
  }
  for (let i = 0; i < (beforeRoutes?.length ?? 0); i++) {
    const b = beforeRoutes![i]!;
    const a = afterRoutes![i]!;
    const id = String(b.routeId ?? "");
    if (JSON.stringify(b) === JSON.stringify(a)) continue;
    const entityAllowed = [...allowed].some((p) => p.startsWith(`${id}.`));
    if (!entityAllowed) {
      throw refinementError(
        "ISOLATION_VIOLATION",
        `Unrelated Social Media route mutated: ${id}`,
      );
    }
  }

  // Root creative/platform/size fields
  const rootFields = [
    "label",
    "notes",
    "formatHint",
    "compositionNotes",
    "onImageCopy",
    "previewAssetRef",
    "canvas",
    "referenceAssetRefs",
  ];
  for (const f of rootFields) {
    if (deepEqual(before[f], after[f])) continue;
    const patchedHere = patch.operations.some((op) => {
      const field = op.target.fieldPath ?? op.property ?? "";
      return (
        field === f ||
        field.startsWith(`${f}.`) ||
        (f === "previewAssetRef" && op.op === "REPLACE_ASSET")
      );
    });
    if (!patchedHere) {
      throw refinementError(
        "ISOLATION_VIOLATION",
        `Unrelated Social Media field mutated: ${f}`,
      );
    }
  }
}
