/**
 * Legacy / provider output → presentation.design-route
 */

import {
  PRESENTATION_ARTIFACT_KEYS,
  presentationSchemaId,
} from "../../artifacts/presentation/keys";
import type { PresentationDesignRouteData } from "../../artifacts/presentation/types";
import { generationArtifactError } from "../errors";
import {
  asString,
  assertVaultAssetIds,
  isRecord,
  requireRecord,
  unwrapProviderEnvelope,
} from "../parse";
import { stableRouteId } from "../stable-ids";

export function normalizePresentationDesignRoute(
  raw: unknown,
  opts?: { routeIndex?: number; vaultAssetIds?: string[] },
): PresentationDesignRouteData {
  let root = unwrapProviderEnvelope(requireRecord(raw, "presentation.design-route"));
  const index = opts?.routeIndex ?? 0;

  // PresentationRoutes envelope → pick one route
  if (Array.isArray(root.routes)) {
    const route = root.routes[index];
    if (!isRecord(route)) {
      throw generationArtifactError(
        "ARTIFACT_NORMALIZATION_FAILED",
        `design-route: routes[${index}] missing`,
      );
    }
    root = route;
  }

  if (
    root.schemaId === presentationSchemaId(PRESENTATION_ARTIFACT_KEYS.designRoute)
  ) {
    return root as unknown as PresentationDesignRouteData;
  }

  const name =
    asString(root.name) ||
    asString(root.title) ||
    asString(root.label) ||
    asString(root.routeTitle);
  if (!name) {
    throw generationArtifactError(
      "ARTIFACT_NORMALIZATION_FAILED",
      "design-route: name/title required",
    );
  }

  if ("selected" in root || "approved" in root || "isSelected" in root) {
    throw generationArtifactError(
      "ARTIFACT_NORMALIZATION_FAILED",
      "design-route must not encode selection/approval",
    );
  }

  const vaultAssetIds = assertVaultAssetIds(
    opts?.vaultAssetIds ??
      (Array.isArray(root.representativeAssetIds)
        ? (root.representativeAssetIds as string[])
        : undefined),
  );

  return {
    schemaId: presentationSchemaId(PRESENTATION_ARTIFACT_KEYS.designRoute),
    routeId: stableRouteId(name, index, asString(root.routeId) || asString(root.id)),
    name,
    description: asString(root.description) || asString(root.desc),
    visualRationale: asString(root.visualRationale) || asString(root.rationale),
    visualIntent: asString(root.visualIntent) || asString(root.narrativeAngle),
    typographyDirection: asString(root.typographyDirection),
    colorDirection: asString(root.colorDirection),
    imageryDirection: asString(root.imageryDirection),
    layoutDirection: asString(root.layoutDirection),
    componentDirection: asString(root.componentDirection),
    constraints: Array.isArray(root.constraints)
      ? root.constraints.filter((c): c is string => typeof c === "string")
      : undefined,
    representativeAssetIds: vaultAssetIds.length ? vaultAssetIds : undefined,
    sampleSlideIds: Array.isArray(root.sampleSlideIds)
      ? (root.sampleSlideIds as unknown[]).filter(
          (x): x is string => typeof x === "string",
        )
      : undefined,
  };
}

/** Normalize all routes from a PresentationRoutes payload. */
export function normalizePresentationDesignRoutes(
  raw: unknown,
  opts?: { vaultAssetIds?: string[] },
): PresentationDesignRouteData[] {
  const root = unwrapProviderEnvelope(requireRecord(raw, "design-routes"));
  if (!Array.isArray(root.routes) || root.routes.length < 1) {
    // Single route object
    return [normalizePresentationDesignRoute(root, opts)];
  }
  return root.routes.map((_, i) =>
    normalizePresentationDesignRoute(root, { ...opts, routeIndex: i }),
  );
}
