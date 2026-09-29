/**
 * Extract machine-readable observations from Packaging artifact data (M8C / M4).
 * Read-only — never mutates artifact data. Never invents geometry or OCR.
 */

import {
  PACKAGING_ARTIFACT_KEYS,
  isPackagingArtifactKey,
} from "../artifacts/packaging/keys";
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
    for (const [k, v] of Object.entries(node)) {
      if (
        k === "schemaId" ||
        k.endsWith("Ref") ||
        k === "previewAssetRef" ||
        k === "uploadedAssetRefs"
      ) {
        continue;
      }
      collectText(v, out);
    }
  }
}

function uniqueIds(ids: string[]): { unique: string[]; duplicates: string[] } {
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) duplicates.push(id);
    else seen.add(id);
  }
  return { unique: [...seen], duplicates };
}

function readExactRef(
  ref: unknown,
): { artifactId: string; version: number; artifactKey?: string } | undefined {
  if (!isRecord(ref)) return undefined;
  const artifactId = String(ref.artifactId ?? "");
  const version = Number(ref.version);
  if (!artifactId || !Number.isInteger(version) || version < 1) return undefined;
  return {
    artifactId,
    version,
    artifactKey: ref.artifactKey ? String(ref.artifactKey) : undefined,
  };
}

function scanForbiddenIdentities(data: unknown): {
  hasLatestRef: boolean;
  hasExecAsAsset: boolean;
  hasArtAsAsset: boolean;
  hasCdfartAsVault: boolean;
} {
  let hasLatestRef = false;
  let hasExecAsAsset = false;
  let hasArtAsAsset = false;
  let hasCdfartAsVault = false;

  const walk = (node: unknown, keyHint = ""): void => {
    if (typeof node === "string") {
      if (node === "latest" || node.toLowerCase() === "latest") hasLatestRef = true;
      if (/^exec_/i.test(node) && /asset|vault|preview|media/i.test(keyHint)) {
        hasExecAsAsset = true;
      }
      if (/^art_/i.test(node) && /asset|vault|preview|media|representative/i.test(keyHint)) {
        hasArtAsAsset = true;
      }
      if (
        /^cdfart_/i.test(node) &&
        /vaultAssetId|representativeAssetIds/i.test(keyHint)
      ) {
        hasCdfartAsVault = true;
      }
      return;
    }
    if (Array.isArray(node)) {
      for (const x of node) walk(x, keyHint);
      return;
    }
    if (isRecord(node)) {
      for (const [k, v] of Object.entries(node)) {
        if (k === "version" && v === "latest") hasLatestRef = true;
        walk(v, k);
      }
    }
  };
  walk(data);
  return { hasLatestRef, hasExecAsAsset, hasArtAsAsset, hasCdfartAsVault };
}

export function observePackagingArtifact(
  artifactKey: string,
  data: Record<string, unknown>,
): ArtifactObservation {
  const titles: string[] = [];
  const textParts: string[] = [];
  const sectionIds: string[] = [];
  const sectionTitles: string[] = [];
  const vaultAssetIds: string[] = [];
  const elementTypes: string[] = [];
  const packagingRefs: NonNullable<ArtifactObservation["packagingRefs"]> = {};

  let routeCount: number | undefined;
  let skuCount: number | undefined;
  let panelIds: string[] | undefined;
  let surfaceIds: string[] | undefined;
  let viewIds: string[] | undefined;
  let skuIds: string[] | undefined;
  let routeIds: string[] | undefined;
  let selectedRouteId: string | undefined;
  let pathKind: string | undefined;
  let packageType: string | undefined;
  let physicalDimensionsMm: ArtifactObservation["physicalDimensionsMm"];
  let geometryUnresolved: boolean | undefined;
  let structuredSceneUnresolved: boolean | undefined;
  let duplicateIds: string[] = [];

  const forbidden = scanForbiddenIdentities(data);

  const pushVault = (id: unknown) => {
    if (typeof id === "string" && id.trim()) vaultAssetIds.push(id.trim());
  };

  if (artifactKey === PACKAGING_ARTIFACT_KEYS.dieline) {
    pathKind = typeof data.pathKind === "string" ? data.pathKind : undefined;
    packageType =
      typeof data.packageType === "string" ? data.packageType : undefined;
    geometryUnresolved = data.geometryUnresolved === true;
    if (isRecord(data.dimensions)) {
      physicalDimensionsMm = {
        widthMm: Number(data.dimensions.widthMm),
        heightMm: Number(data.dimensions.heightMm),
        depthMm:
          data.dimensions.depthMm != null
            ? Number(data.dimensions.depthMm)
            : undefined,
      };
    }
    const panels = Array.isArray(data.panels) ? data.panels : [];
    const ids: string[] = [];
    for (const p of panels) {
      if (!isRecord(p)) continue;
      if (typeof p.id === "string") ids.push(p.id);
      if (typeof p.name === "string") titles.push(p.name);
    }
    const u = uniqueIds(ids);
    panelIds = u.unique;
    duplicateIds = [...duplicateIds, ...u.duplicates];
    if (Array.isArray(data.uploadedAssetRefs)) {
      for (const a of data.uploadedAssetRefs) {
        if (isRecord(a)) pushVault(a.vaultAssetId);
      }
    }
  } else if (artifactKey === PACKAGING_ARTIFACT_KEYS.routes) {
    const routes = Array.isArray(data.routes) ? data.routes : [];
    routeCount = routes.length;
    const ids: string[] = [];
    for (const r of routes) {
      if (!isRecord(r)) continue;
      if (typeof r.routeId === "string") ids.push(r.routeId);
      if (typeof r.name === "string") {
        titles.push(r.name);
        textParts.push(r.name);
      }
      collectText(
        {
          shelfIdea: r.shelfIdea,
          visualDirection: r.visualDirection,
          designRationale: r.designRationale,
          typographyDirection: r.typographyDirection,
          colorDirection: r.colorDirection,
        },
        textParts,
      );
      if (Array.isArray(r.representativeAssetIds)) {
        for (const id of r.representativeAssetIds) pushVault(id);
      }
    }
    const u = uniqueIds(ids);
    routeIds = u.unique;
    duplicateIds = [...duplicateIds, ...u.duplicates];
    selectedRouteId =
      typeof data.selectedRouteId === "string" ? data.selectedRouteId : undefined;
    const dRef = readExactRef(data.dielineRef);
    if (dRef) packagingRefs.dieline = dRef;
  } else if (artifactKey === PACKAGING_ARTIFACT_KEYS.threeDDirection) {
    structuredSceneUnresolved = data.structuredSceneUnresolved === true;
    const candidates = Array.isArray(data.candidates) ? data.candidates : [];
    const ids: string[] = [];
    for (const c of candidates) {
      if (!isRecord(c)) continue;
      if (typeof c.id === "string") ids.push(c.id);
      if (typeof c.name === "string") titles.push(c.name);
      if (typeof c.visualIntent === "string") textParts.push(c.visualIntent);
      if (isRecord(c.previewAssetRef)) pushVault(c.previewAssetRef.vaultAssetId);
    }
    const u = uniqueIds(ids);
    sectionIds.push(...u.unique);
    duplicateIds = [...duplicateIds, ...u.duplicates];
    const dRef = readExactRef(data.dielineRef);
    const rRef = readExactRef(data.routesRef);
    if (dRef) packagingRefs.dieline = dRef;
    if (rRef) packagingRefs.routes = rRef;
  } else if (artifactKey === PACKAGING_ARTIFACT_KEYS.frontPack) {
    if (typeof data.frontId === "string") surfaceIds = [data.frontId];
    collectText(
      {
        compositionNotes: data.compositionNotes,
        brandLockupNotes: data.brandLockupNotes,
        mandatoryCopy: data.mandatoryCopy,
      },
      textParts,
    );
    if (Array.isArray(data.mandatoryCopy)) {
      for (const m of data.mandatoryCopy) {
        if (typeof m === "string") textParts.push(m);
      }
    }
    if (isRecord(data.previewAssetRef)) pushVault(data.previewAssetRef.vaultAssetId);
    const dRef = readExactRef(data.dielineRef);
    const rRef = readExactRef(data.routesRef);
    const tRef = readExactRef(data.threeDDirectionRef);
    if (dRef) packagingRefs.dieline = dRef;
    if (rRef) packagingRefs.routes = rRef;
    if (tRef) packagingRefs.threeDDirection = tRef;
  } else if (artifactKey === PACKAGING_ARTIFACT_KEYS.completePack) {
    const surfaces = Array.isArray(data.surfaces) ? data.surfaces : [];
    const ids: string[] = [];
    for (const s of surfaces) {
      if (!isRecord(s)) continue;
      if (typeof s.id === "string") ids.push(s.id);
      if (isRecord(s.previewAssetRef)) pushVault(s.previewAssetRef.vaultAssetId);
    }
    const u = uniqueIds(ids);
    surfaceIds = u.unique;
    duplicateIds = [...duplicateIds, ...u.duplicates];
    for (const [k, field] of [
      ["dieline", "dielineRef"],
      ["routes", "routesRef"],
      ["threeDDirection", "threeDDirectionRef"],
      ["frontPack", "frontPackRef"],
    ] as const) {
      const ref = readExactRef(data[field]);
      if (ref) packagingRefs[k] = ref;
    }
  } else if (artifactKey === PACKAGING_ARTIFACT_KEYS.views) {
    const views = Array.isArray(data.views) ? data.views : [];
    const ids: string[] = [];
    for (const v of views) {
      if (!isRecord(v)) continue;
      if (typeof v.id === "string") ids.push(v.id);
      if (typeof v.name === "string") titles.push(v.name);
      if (isRecord(v.previewAssetRef)) pushVault(v.previewAssetRef.vaultAssetId);
    }
    const u = uniqueIds(ids);
    viewIds = u.unique;
    duplicateIds = [...duplicateIds, ...u.duplicates];
    const cRef = readExactRef(data.completePackRef);
    if (cRef) packagingRefs.completePack = cRef;
  } else if (artifactKey === PACKAGING_ARTIFACT_KEYS.skuAdaptations) {
    const skus = Array.isArray(data.skus) ? data.skus : [];
    skuCount = skus.length;
    const ids: string[] = [];
    for (const s of skus) {
      if (!isRecord(s)) continue;
      if (typeof s.id === "string") ids.push(s.id);
      if (typeof s.label === "string") {
        titles.push(s.label);
        textParts.push(s.label);
      }
      if (typeof s.variantName === "string") textParts.push(s.variantName);
      if (isRecord(s.previewAssetRef)) pushVault(s.previewAssetRef.vaultAssetId);
    }
    const u = uniqueIds(ids);
    skuIds = u.unique;
    duplicateIds = [...duplicateIds, ...u.duplicates];
    const vRef = readExactRef(data.viewsRef);
    const cRef = readExactRef(data.completePackRef);
    if (vRef) packagingRefs.views = vRef;
    if (cRef) packagingRefs.completePack = cRef;
  } else {
    collectText(data, textParts);
  }

  collectText({ titles, notes: data.technicalNotes }, textParts);

  return {
    artifactKey,
    routeCount,
    skuCount,
    titles: [...new Set(titles)],
    textCorpus: textParts.join("\n"),
    sectionIds,
    sectionTitles: [...new Set(sectionTitles)],
    colors: [],
    colorKeys: [],
    vaultAssetIds: [...new Set(vaultAssetIds)],
    elementTypes,
    exactHeadlines: [...new Set(titles)],
    panelIds,
    surfaceIds,
    viewIds,
    skuIds,
    routeIds,
    selectedRouteId,
    pathKind,
    packageType,
    physicalDimensionsMm,
    geometryUnresolved,
    structuredSceneUnresolved,
    packagingRefs,
    hasLatestRef: forbidden.hasLatestRef,
    hasExecAsAsset: forbidden.hasExecAsAsset,
    hasArtAsAsset: forbidden.hasArtAsAsset,
    hasCdfartAsVault: forbidden.hasCdfartAsVault,
    duplicateIds: [...new Set(duplicateIds)],
  };
}

export function isPackagingValidationKey(artifactKey: string): boolean {
  return (
    isPackagingArtifactKey(artifactKey) || artifactKey.startsWith("packaging.")
  );
}
