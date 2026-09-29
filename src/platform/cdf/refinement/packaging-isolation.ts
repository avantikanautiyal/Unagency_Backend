/**
 * M8D — Packaging patch isolation: only targeted entity+field may change;
 * exact upstream refs and schema identity must be preserved.
 */

import { refinementError } from "./errors";
import type { CdfRefinementPatch } from "./types";

const PROTECTED_ROOT_KEYS = [
  "schemaId",
  "dielineRef",
  "routesRef",
  "threeDDirectionRef",
  "frontPackRef",
  "completePackRef",
  "viewsRef",
  "geometryUnresolved",
  "structuredSceneUnresolved",
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
    if (field === "bounds" || field.startsWith("bounds.")) {
      set.add(`${id}.bounds`);
    }
    if (field.startsWith("camera.")) set.add(`${id}.camera`);
  }
  return set;
}

function entityFingerprint(
  data: Record<string, unknown>,
  kind: "panels" | "routes" | "candidates" | "surfaces" | "views" | "skus",
  idKey: "id" | "routeId",
): Map<string, string> {
  const list = data[kind] as Array<Record<string, unknown>> | undefined;
  const map = new Map<string, string>();
  for (const item of list ?? []) {
    const id = String(item[idKey] ?? item.id ?? "");
    if (id) map.set(id, JSON.stringify(item));
  }
  return map;
}

export function assertPackagingIsolation(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  patch: CdfRefinementPatch,
): void {
  for (const key of PROTECTED_ROOT_KEYS) {
    if (!deepEqual(before[key], after[key])) {
      throw refinementError(
        "ISOLATION_VIOLATION",
        `Protected Packaging field mutated: ${key}`,
      );
    }
  }

  const allowed = allowedPaths(patch);

  // front-pack: root fields other than patched
  if (typeof before.frontId === "string") {
    const frontFields = [
      "frontId",
      "compositionNotes",
      "brandLockupNotes",
      "variantNameNotes",
      "mandatoryCopy",
      "previewAssetRef",
    ];
    for (const f of frontFields) {
      const path = `${before.frontId}.${f}`;
      const alt = `package_surface_front.${f}`;
      if (allowed.has(path) || allowed.has(alt) || allowed.has(`front.${f}`)) {
        continue;
      }
      // Also allow if entityId is frontId and field matches
      const hit = [...allowed].some(
        (p) =>
          p === `${before.frontId}.${f}` ||
          (p.endsWith(`.${f}`) &&
            patch.operations.some(
              (op) =>
                op.target.entityId === before.frontId &&
                (op.target.fieldPath === f || op.property === f),
            )),
      );
      if (hit) continue;
      if (!deepEqual(before[f], after[f])) {
        // patched field may be this one
        const patchedHere = patch.operations.some(
          (op) =>
            (op.target.entityId === before.frontId ||
              op.target.entityKind === "surface") &&
            (op.target.fieldPath === f || op.property === f),
        );
        if (!patchedHere) {
          throw refinementError(
            "ISOLATION_VIOLATION",
            `Unrelated front-pack field mutated: ${f}`,
          );
        }
      }
    }
  }

  const checks: Array<{
    kind: "panels" | "routes" | "candidates" | "surfaces" | "views" | "skus";
    idKey: "id" | "routeId";
  }> = [
    { kind: "panels", idKey: "id" },
    { kind: "routes", idKey: "routeId" },
    { kind: "candidates", idKey: "id" },
    { kind: "surfaces", idKey: "id" },
    { kind: "views", idKey: "id" },
    { kind: "skus", idKey: "id" },
  ];

  for (const { kind, idKey } of checks) {
    const b = entityFingerprint(before, kind, idKey);
    const a = entityFingerprint(after, kind, idKey);
    if (b.size !== a.size) {
      throw refinementError(
        "ISOLATION_VIOLATION",
        `Packaging ${kind} cardinality changed during refinement`,
      );
    }
    for (const [id, beforeJson] of b) {
      const afterJson = a.get(id);
      if (afterJson == null) {
        throw refinementError(
          "ISOLATION_VIOLATION",
          `Packaging entity removed: ${id}`,
        );
      }
      if (beforeJson === afterJson) continue;
      const entityAllowed = [...allowed].some((p) => p.startsWith(`${id}.`));
      if (!entityAllowed) {
        throw refinementError(
          "ISOLATION_VIOLATION",
          `Unrelated Packaging entity mutated: ${id}`,
        );
      }
    }
  }
}
