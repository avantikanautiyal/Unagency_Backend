/**
 * Extract machine-readable observations from Presentation artifact data (M4).
 * Read-only — never mutates artifact data.
 */

import { PRESENTATION_ARTIFACT_KEYS } from "../artifacts/presentation/keys";
import type { ArtifactObservation } from "./types";

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

function collectText(node: unknown, out: string[]): void {
  if (typeof node === "string") {
    out.push(node);
    return;
  }
  if (Array.isArray(node)) {
    for (const x of node) collectText(x, out);
    return;
  }
  if (isRecord(node)) {
    for (const v of Object.values(node)) collectText(v, out);
  }
}

export function observePresentationArtifact(
  artifactKey: string,
  data: Record<string, unknown>,
): ArtifactObservation {
  const titles: string[] = [];
  const textParts: string[] = [];
  const sectionIds: string[] = [];
  const sectionTitles: string[] = [];
  const colors: string[] = [];
  const colorKeys: string[] = [];
  const vaultAssetIds: string[] = [];
  const elementTypes: string[] = [];
  const exactHeadlines: string[] = [];

  let slideCount: number | undefined;
  let routeCount: number | undefined;
  let dimensions: ArtifactObservation["dimensions"];
  let designSystemRef: ArtifactObservation["designSystemRef"];
  let derivedFromRoute: ArtifactObservation["derivedFromRoute"];
  let hasLogoAsset = false;

  if (artifactKey === PRESENTATION_ARTIFACT_KEYS.deck) {
    const slides = Array.isArray(data.slides) ? data.slides : [];
    slideCount = slides.length;
    if (isRecord(data.metadata) && isRecord(data.metadata.dimensions)) {
      const d = data.metadata.dimensions;
      dimensions = {
        widthUnits: Number(d.widthUnits),
        heightUnits: Number(d.heightUnits),
        aspectRatio: String(d.aspectRatio ?? ""),
      };
    }
    if (isRecord(data.designSystemRef)) {
      designSystemRef = {
        artifactId: String(data.designSystemRef.artifactId ?? ""),
        version: Number(data.designSystemRef.version),
        artifactKey: data.designSystemRef.artifactKey
          ? String(data.designSystemRef.artifactKey)
          : undefined,
      };
    }
    for (const slide of slides) {
      if (!isRecord(slide)) continue;
      if (typeof slide.id === "string") sectionIds.push(slide.id);
      if (typeof slide.title === "string") titles.push(slide.title);
      const elements = Array.isArray(slide.elements) ? slide.elements : [];
      for (const el of elements) {
        if (!isRecord(el)) continue;
        if (typeof el.type === "string") elementTypes.push(el.type);
        if (el.type === "text" && typeof el.content === "string") {
          textParts.push(el.content);
          if (
            isRecord(el.style) &&
            (el.style.fontRole === "title" ||
              String(el.id ?? "").includes("title"))
          ) {
            exactHeadlines.push(el.content);
            titles.push(el.content);
          }
        }
        if (el.type === "image" && typeof el.vaultAssetId === "string") {
          vaultAssetIds.push(el.vaultAssetId);
          const alt = String(el.alt ?? "").toLowerCase();
          if (alt.includes("logo") || String(el.id ?? "").includes("logo")) {
            hasLogoAsset = true;
          }
        }
      }
    }
  } else if (artifactKey === PRESENTATION_ARTIFACT_KEYS.storyline) {
    const slides = Array.isArray(data.slides) ? data.slides : [];
    slideCount = slides.length;
    for (const s of slides) {
      if (!isRecord(s)) continue;
      if (typeof s.title === "string") titles.push(s.title);
      if (typeof s.keyMessage === "string") textParts.push(s.keyMessage);
      if (typeof s.purpose === "string") textParts.push(s.purpose);
    }
    const sections = Array.isArray(data.sections) ? data.sections : [];
    for (const sec of sections) {
      if (!isRecord(sec)) continue;
      if (typeof sec.id === "string") sectionIds.push(sec.id);
      if (typeof sec.title === "string") {
        sectionTitles.push(sec.title);
        titles.push(sec.title);
      }
    }
    if (typeof data.objective === "string") textParts.push(data.objective);
    if (typeof data.audience === "string") textParts.push(data.audience);
  } else if (artifactKey === PRESENTATION_ARTIFACT_KEYS.slideContent) {
    const slides = Array.isArray(data.slides) ? data.slides : [];
    slideCount = slides.length;
    for (const s of slides) {
      if (!isRecord(s)) continue;
      if (typeof s.title === "string") {
        titles.push(s.title);
        exactHeadlines.push(s.title);
      }
      collectText(s.blocks, textParts);
    }
  } else if (artifactKey === PRESENTATION_ARTIFACT_KEYS.designRoute) {
    routeCount = 1;
    if (typeof data.name === "string") titles.push(data.name);
    collectText(data, textParts);
    if (Array.isArray(data.representativeAssetIds)) {
      for (const id of data.representativeAssetIds) {
        if (typeof id === "string") vaultAssetIds.push(id);
      }
    }
  } else if (artifactKey === PRESENTATION_ARTIFACT_KEYS.designSystem) {
    if (isRecord(data.colors)) {
      for (const [k, v] of Object.entries(data.colors)) {
        colorKeys.push(k);
        if (typeof v === "string") colors.push(v);
      }
    }
    if (isRecord(data.derivedFromRoute)) {
      derivedFromRoute = {
        artifactId: String(data.derivedFromRoute.artifactId ?? ""),
        version: Number(data.derivedFromRoute.version),
      };
    }
  } else if (artifactKey === PRESENTATION_ARTIFACT_KEYS.source) {
    collectText(data, textParts);
    if (Array.isArray(data.uploadedAssets)) {
      for (const a of data.uploadedAssets) {
        if (isRecord(a) && typeof a.vaultAssetId === "string") {
          vaultAssetIds.push(a.vaultAssetId);
          if (String(a.role ?? "").toLowerCase() === "logo") hasLogoAsset = true;
        }
      }
    }
  }

  collectText(
    {
      titles,
      notes: data.notes,
    },
    textParts,
  );

  return {
    artifactKey,
    slideCount,
    routeCount,
    dimensions,
    aspectRatio: dimensions?.aspectRatio,
    titles: [...new Set(titles)],
    textCorpus: textParts.join("\n"),
    sectionIds,
    sectionTitles: [...new Set(sectionTitles)],
    colors,
    colorKeys,
    vaultAssetIds: [...new Set(vaultAssetIds)],
    designSystemRef,
    derivedFromRoute,
    hasLogoAsset,
    elementTypes,
    exactHeadlines: [...new Set(exactHeadlines.length ? exactHeadlines : titles)],
  };
}
