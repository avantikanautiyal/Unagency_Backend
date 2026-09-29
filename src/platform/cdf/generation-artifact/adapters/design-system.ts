/**
 * Legacy / provider output → presentation.design-system
 */

import { isCdfCanonicalArtifactId } from "../../artifacts/ids";
import {
  PRESENTATION_ARTIFACT_KEYS,
  presentationSchemaId,
} from "../../artifacts/presentation/keys";
import type { PresentationDesignSystemData } from "../../artifacts/presentation/types";
import { generationArtifactError } from "../errors";
import { asString, isRecord, requireRecord, unwrapProviderEnvelope } from "../parse";

export function normalizePresentationDesignSystem(
  raw: unknown,
  opts?: {
    designRouteRef?: { artifactId: string; version: number };
  },
): PresentationDesignSystemData {
  const root = unwrapProviderEnvelope(
    requireRecord(raw, "presentation.design-system"),
  );

  if (
    root.schemaId ===
    presentationSchemaId(PRESENTATION_ARTIFACT_KEYS.designSystem)
  ) {
    const data = { ...(root as unknown as PresentationDesignSystemData) };
    if (!data.derivedFromRoute && opts?.designRouteRef) {
      data.derivedFromRoute = opts.designRouteRef;
    }
    return data;
  }

  if (!isRecord(root.colors) || !isRecord(root.fontRoles)) {
    throw generationArtifactError(
      "ARTIFACT_NORMALIZATION_FAILED",
      "design-system: colors and fontRoles objects required (refuse to invent tokens)",
    );
  }

  const fontRoles: PresentationDesignSystemData["fontRoles"] = {};
  for (const [role, def] of Object.entries(root.fontRoles)) {
    if (!isRecord(def) || !asString(def.family)) {
      throw generationArtifactError(
        "ARTIFACT_NORMALIZATION_FAILED",
        `design-system: fontRoles.${role}.family required`,
      );
    }
    fontRoles[role] = {
      family: asString(def.family)!,
      size: typeof def.size === "number" ? def.size : undefined,
      weight: (def.weight as number | string | undefined) ?? undefined,
      lineHeight: typeof def.lineHeight === "number" ? def.lineHeight : undefined,
      letterSpacing:
        typeof def.letterSpacing === "number" ? def.letterSpacing : undefined,
    };
  }

  if (Object.keys(fontRoles).length < 1) {
    throw generationArtifactError(
      "ARTIFACT_NORMALIZATION_FAILED",
      "design-system: at least one fontRole required",
    );
  }

  const colors: Record<string, string> = {};
  for (const [k, v] of Object.entries(root.colors)) {
    if (typeof v !== "string" || !v.trim()) {
      throw generationArtifactError(
        "ARTIFACT_NORMALIZATION_FAILED",
        `design-system: colors.${k} must be a string`,
      );
    }
    colors[k] = v.trim();
  }

  let derivedFromRoute = opts?.designRouteRef;
  if (isRecord(root.derivedFromRoute)) {
    const aid = asString(root.derivedFromRoute.artifactId);
    const ver = root.derivedFromRoute.version;
    if (!aid || !isCdfCanonicalArtifactId(aid)) {
      throw generationArtifactError(
        "ARTIFACT_NORMALIZATION_FAILED",
        "design-system: derivedFromRoute.artifactId must be cdfart_*",
      );
    }
    if (!Number.isInteger(ver) || (ver as number) < 1) {
      throw generationArtifactError(
        "ARTIFACT_NORMALIZATION_FAILED",
        "design-system: derivedFromRoute.version must be >= 1",
      );
    }
    derivedFromRoute = { artifactId: aid, version: ver as number };
  }

  if (!derivedFromRoute) {
    throw generationArtifactError(
      "ARTIFACT_NORMALIZATION_FAILED",
      "design-system: exact designRouteRef (artifactId+version) required",
    );
  }

  return {
    schemaId: presentationSchemaId(PRESENTATION_ARTIFACT_KEYS.designSystem),
    name: asString(root.name),
    derivedFromRoute,
    colors,
    fontRoles,
    spacing: isRecord(root.spacing)
      ? (root.spacing as Record<string, number>)
      : undefined,
    grid: isRecord(root.grid)
      ? {
          columns:
            typeof root.grid.columns === "number" ? root.grid.columns : undefined,
          gutter:
            typeof root.grid.gutter === "number" ? root.grid.gutter : undefined,
          margin:
            typeof root.grid.margin === "number" ? root.grid.margin : undefined,
        }
      : undefined,
    layoutRules: Array.isArray(root.layoutRules)
      ? root.layoutRules.filter((x): x is string => typeof x === "string")
      : undefined,
    visualHierarchy: Array.isArray(root.visualHierarchy)
      ? root.visualHierarchy.filter((x): x is string => typeof x === "string")
      : undefined,
    accessibility: isRecord(root.accessibility)
      ? {
          minContrast: asString(root.accessibility.minContrast),
          maxLineLength:
            typeof root.accessibility.maxLineLength === "number"
              ? root.accessibility.maxLineLength
              : undefined,
          notes: Array.isArray(root.accessibility.notes)
            ? root.accessibility.notes.filter(
                (x): x is string => typeof x === "string",
              )
            : undefined,
        }
      : undefined,
  };
}
