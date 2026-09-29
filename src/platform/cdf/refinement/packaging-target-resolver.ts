/**
 * M8D — Resolve Packaging refinement targets by stable IDs only.
 */

import { PACKAGING_ARTIFACT_KEYS } from "../artifacts/packaging/keys";
import { refinementError } from "./errors";
import type { ParsedPackagingRefinementIntent } from "./packaging-instruction-parser";
import type { CdfResolvedRefinementTarget } from "./types";

export type PackagingResolveResult =
  | { status: "ok"; target: CdfResolvedRefinementTarget }
  | {
      status: "requires_clarification";
      reason: string;
      candidates: string[];
    };

function listStableIds(data: Record<string, unknown>): string[] {
  const out: string[] = [];
  const panels = data.panels as Array<{ id?: string }> | undefined;
  for (const p of panels ?? []) if (p.id) out.push(p.id);
  const routes = data.routes as Array<{ routeId?: string }> | undefined;
  for (const r of routes ?? []) if (r.routeId) out.push(r.routeId);
  const candidates = data.candidates as Array<{ id?: string }> | undefined;
  for (const c of candidates ?? []) if (c.id) out.push(c.id);
  if (typeof data.frontId === "string") out.push(data.frontId);
  const surfaces = data.surfaces as Array<{ id?: string }> | undefined;
  for (const s of surfaces ?? []) if (s.id) out.push(s.id);
  const views = data.views as Array<{ id?: string }> | undefined;
  for (const v of views ?? []) if (v.id) out.push(v.id);
  const skus = data.skus as Array<{ id?: string }> | undefined;
  for (const s of skus ?? []) if (s.id) out.push(s.id);
  return out;
}

function entityExists(
  data: Record<string, unknown>,
  kind: string | undefined,
  id: string | undefined,
): boolean {
  if (kind === "artifact") return true;
  if (!id) return false;
  if (kind === "panel") {
    return Boolean(
      (data.panels as Array<{ id: string }> | undefined)?.some((p) => p.id === id),
    );
  }
  if (kind === "route") {
    return Boolean(
      (data.routes as Array<{ routeId: string }> | undefined)?.some(
        (r) => r.routeId === id,
      ),
    );
  }
  if (kind === "direction") {
    return Boolean(
      (data.candidates as Array<{ id: string }> | undefined)?.some(
        (c) => c.id === id,
      ),
    );
  }
  if (kind === "surface") {
    if (data.frontId === id) return true;
    return Boolean(
      (data.surfaces as Array<{ id: string }> | undefined)?.some(
        (s) => s.id === id,
      ),
    );
  }
  if (kind === "view") {
    return Boolean(
      (data.views as Array<{ id: string }> | undefined)?.some((v) => v.id === id),
    );
  }
  if (kind === "sku") {
    return Boolean(
      (data.skus as Array<{ id: string }> | undefined)?.some((s) => s.id === id),
    );
  }
  return listStableIds(data).includes(id);
}

export function resolvePackagingRefinementTarget(input: {
  data: Record<string, unknown>;
  artifactId: string;
  artifactVersion: number;
  artifactKey: string;
  intent: ParsedPackagingRefinementIntent;
}): PackagingResolveResult {
  const { data, intent } = input;

  if (intent.ambiguous && !intent.entityId) {
    return {
      status: "requires_clarification",
      reason: intent.ambiguityReason ?? "AMBIGUOUS_TARGET",
      candidates: listStableIds(data),
    };
  }

  if (intent.entityKind === "artifact") {
    return {
      status: "ok",
      target: {
        artifactId: input.artifactId,
        artifactVersion: input.artifactVersion,
        artifactKey: input.artifactKey,
        path: `artifact.${intent.field ?? "root"}`,
        targetKind: "property",
        entityKind: "artifact",
        fieldPath: intent.field,
      },
    };
  }

  if (!intent.entityId) {
    return {
      status: "requires_clarification",
      reason: "AMBIGUOUS_TARGET",
      candidates: listStableIds(data),
    };
  }

  if (!entityExists(data, intent.entityKind, intent.entityId)) {
    throw refinementError(
      "TARGET_NOT_FOUND",
      `Packaging target not found: ${intent.entityId}`,
      { entityId: intent.entityId, candidates: listStableIds(data) },
    );
  }

  // Raster-only invent: front with only preview + logo request already unsupported upstream
  if (
    input.artifactKey === PACKAGING_ARTIFACT_KEYS.frontPack &&
    intent.inventElement
  ) {
    throw refinementError(
      "UNSUPPORTED_OPERATION",
      "Cannot invent structured elements on raster-backed front-pack",
    );
  }

  const path = intent.field
    ? `${intent.entityId}.${intent.field}`
    : intent.entityId;

  return {
    status: "ok",
    target: {
      artifactId: input.artifactId,
      artifactVersion: input.artifactVersion,
      artifactKey: input.artifactKey,
      path,
      targetKind: "property",
      entityId: intent.entityId,
      entityKind: intent.entityKind,
      fieldPath: intent.field,
    },
  };
}
