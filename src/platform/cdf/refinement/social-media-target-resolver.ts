/**
 * M9D — Resolve Social Media refinement targets by stable IDs only.
 */

import { refinementError } from "./errors";
import type { ParsedSocialMediaRefinementIntent } from "./social-media-instruction-parser";
import type { CdfResolvedRefinementTarget } from "./types";

export type SocialMediaResolveResult =
  | { status: "ok"; target: CdfResolvedRefinementTarget }
  | {
      status: "requires_clarification";
      reason: string;
      candidates: string[];
    };

function listStableIds(data: Record<string, unknown>): string[] {
  const out: string[] = [];
  if (typeof data.platformId === "string") out.push(data.platformId);
  if (typeof data.optionId === "string") out.push(data.optionId);
  if (typeof data.creativeId === "string") out.push(data.creativeId);
  const routes = data.routes as Array<{ routeId?: string }> | undefined;
  for (const r of routes ?? []) if (r.routeId) out.push(r.routeId);
  return out;
}

function entityExists(
  data: Record<string, unknown>,
  kind: string | undefined,
  id: string | undefined,
): boolean {
  if (kind === "artifact") return true;
  if (!id) {
    if (kind === "creative" && typeof data.creativeId === "string") return true;
    if (kind === "platform" && typeof data.platformId === "string") return true;
    if (kind === "size" && typeof data.optionId === "string") return true;
    return false;
  }
  if (kind === "route") {
    return Boolean(
      (data.routes as Array<{ routeId: string }> | undefined)?.some(
        (r) => r.routeId === id,
      ),
    );
  }
  if (kind === "creative") {
    return data.creativeId === id;
  }
  if (kind === "platform") {
    return data.platformId === id;
  }
  if (kind === "size") {
    return data.optionId === id;
  }
  return listStableIds(data).includes(id);
}

export function resolveSocialMediaRefinementTarget(input: {
  data: Record<string, unknown>;
  artifactId: string;
  artifactVersion: number;
  artifactKey: string;
  intent: ParsedSocialMediaRefinementIntent;
}): SocialMediaResolveResult {
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

  // Default single-entity ids when kind known but id omitted
  let entityId = intent.entityId;
  if (!entityId) {
    if (intent.entityKind === "creative" && typeof data.creativeId === "string") {
      entityId = data.creativeId;
    } else if (
      intent.entityKind === "platform" &&
      typeof data.platformId === "string"
    ) {
      entityId = data.platformId;
    } else if (
      intent.entityKind === "size" &&
      typeof data.optionId === "string"
    ) {
      entityId = data.optionId;
    }
  }

  if (!entityId) {
    return {
      status: "requires_clarification",
      reason: "AMBIGUOUS_TARGET",
      candidates: listStableIds(data),
    };
  }

  if (!entityExists(data, intent.entityKind, entityId)) {
    throw refinementError(
      "TARGET_NOT_FOUND",
      `Social Media target not found: ${entityId}`,
    );
  }

  // Reject exec_*/art_*/cdfart_* as element ids
  if (/^(exec_|art_|cdfart_)/.test(entityId)) {
    throw refinementError(
      "UNSUPPORTED_OPERATION",
      "exec_*/art_*/cdfart_* are not Social Media element/stable target IDs",
    );
  }

  return {
    status: "ok",
    target: {
      artifactId: input.artifactId,
      artifactVersion: input.artifactVersion,
      artifactKey: input.artifactKey,
      entityId,
      entityKind: intent.entityKind,
      fieldPath: intent.field,
      path: `${entityId}.${intent.field ?? "root"}`,
      targetKind: "property",
    },
  };
}
