/**
 * Deterministic design-system derivation from a selected design-route.
 * Not a session-agnostic fixture — tokens come from the route's directions.
 */

import {
  PRESENTATION_ARTIFACT_KEYS,
  presentationSchemaId,
} from "../artifacts/presentation/keys";
import type {
  PresentationDesignRouteData,
  PresentationDesignSystemData,
} from "../artifacts/presentation/types";

const DEFAULT_PALETTE = [
  "#0B1F3A",
  "#FFFFFF",
  "#2ECC71",
  "#F4F6F8",
  "#1A1A1A",
] as const;

function pickHexFromText(text: string | undefined, fallback: string): string {
  if (!text) return fallback;
  const m = text.match(/#([0-9a-fA-F]{6})\b/);
  return m ? `#${m[1]}` : fallback;
}

function familyFromTypography(text: string | undefined): string {
  if (!text) return "Source Sans 3";
  const lower = text.toLowerCase();
  if (lower.includes("serif") || lower.includes("georgia")) return "Georgia";
  if (lower.includes("mono")) return "IBM Plex Mono";
  if (lower.includes("display") || lower.includes("impact")) return "Oswald";
  return "Source Sans 3";
}

/**
 * Derive a canonical presentation.design-system payload from the selected route.
 * Colors/fonts are deterministic functions of route directions — never invent
 * narrative content, never use FIXTURE_IDS.
 */
export function deriveDesignSystemFromRoute(
  route: PresentationDesignRouteData,
  designRouteRef: { artifactId: string; version: number },
): PresentationDesignSystemData {
  const primary = pickHexFromText(route.colorDirection, DEFAULT_PALETTE[0]);
  const surface = pickHexFromText(
    `${route.colorDirection ?? ""} surface`,
    DEFAULT_PALETTE[0],
  );
  const onSurface =
    route.colorDirection?.toLowerCase().includes("light")
      ? DEFAULT_PALETTE[4]
      : DEFAULT_PALETTE[1];
  const accent = pickHexFromText(
    route.colorDirection?.includes("#")
      ? route.colorDirection
      : undefined,
    DEFAULT_PALETTE[2],
  );
  // Prefer a distinct accent when only one hex was found
  const accentFinal =
    accent.toLowerCase() === primary.toLowerCase()
      ? DEFAULT_PALETTE[2]
      : accent;

  const family = familyFromTypography(route.typographyDirection);

  return {
    schemaId: presentationSchemaId(PRESENTATION_ARTIFACT_KEYS.designSystem),
    name: `${route.name} System`,
    derivedFromRoute: {
      artifactId: designRouteRef.artifactId,
      version: designRouteRef.version,
    },
    colors: {
      "color.primary": primary,
      "color.surface": surface,
      "color.on_surface": onSurface,
      "color.accent": accentFinal,
    },
    fontRoles: {
      title: { family, size: 40, weight: 700 },
      subtitle: { family, size: 22, weight: 500 },
      body: { family, size: 16, weight: 400 },
      metric: { family, size: 28, weight: 600 },
    },
    spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 40 },
    grid: { columns: 12, gutter: 16, margin: 48 },
    layoutRules: [
      ...(route.layoutDirection ? [route.layoutDirection] : []),
      ...(route.constraints ?? []),
    ].slice(0, 12),
    visualHierarchy: ["title", "metric", "body"],
    accessibility: {
      minContrast: "AA",
      notes: route.visualRationale ? [route.visualRationale] : undefined,
    },
    sourceRefs: {
      upstreamArtifactRefs: [
        {
          artifactId: designRouteRef.artifactId,
          version: designRouteRef.version,
          artifactKey: PRESENTATION_ARTIFACT_KEYS.designRoute,
        },
      ],
    },
  };
}
