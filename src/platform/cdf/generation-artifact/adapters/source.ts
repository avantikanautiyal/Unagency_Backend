/**
 * Legacy / provider output → presentation.source
 */

import {
  PRESENTATION_ARTIFACT_KEYS,
  presentationSchemaId,
} from "../../artifacts/presentation/keys";
import type { PresentationSourceData } from "../../artifacts/presentation/types";
import { generationArtifactError } from "../errors";
import {
  asString,
  assertVaultAssetIds,
  requireRecord,
  unwrapProviderEnvelope,
} from "../parse";
import { slugifyId } from "../stable-ids";

export function normalizePresentationSource(
  raw: unknown,
  opts?: {
    activeBriefId?: string;
    activeBriefVersion?: number;
    vaultAssetIds?: string[];
    sourceInputIds?: string[];
  },
): PresentationSourceData {
  const root = unwrapProviderEnvelope(requireRecord(raw, "presentation.source"));
  const vaultAssetIds = assertVaultAssetIds(opts?.vaultAssetIds);

  if (
    root.schemaId === presentationSchemaId(PRESENTATION_ARTIFACT_KEYS.source) ||
    Array.isArray(root.sourceDocuments) ||
    root.briefRef
  ) {
    const data = { ...root } as unknown as PresentationSourceData;
    data.schemaId = presentationSchemaId(PRESENTATION_ARTIFACT_KEYS.source);
    if (!data.briefRef && (opts?.activeBriefId || opts?.activeBriefVersion != null)) {
      data.briefRef = {
        activeBriefId: opts.activeBriefId,
        activeBriefVersion: opts.activeBriefVersion,
      };
    }
    return data;
  }

  const title =
    asString(root.title) || asString(root.name) || asString(root.label);
  const choice =
    asString(root.choice) || asString(root.selected) || asString(root.source);

  if (
    !title &&
    !choice &&
    !asString(root.summary) &&
    !Array.isArray(root.constraints)
  ) {
    throw generationArtifactError(
      "ARTIFACT_NORMALIZATION_FAILED",
      "presentation.source: cannot normalize without title/choice/summary/constraints",
    );
  }

  const uploadedAssets = vaultAssetIds.map((vaultAssetId, i) => ({
    vaultAssetId,
    role: "upload",
    label: `asset_${i + 1}`,
  }));

  const excerpts: PresentationSourceData["sourceTextExcerpts"] = [];
  const summary =
    asString(root.summary) || asString(root.text) || asString(root.brief);
  if (summary) {
    excerpts.push({ id: "excerpt_01", text: summary });
  }

  return {
    schemaId: presentationSchemaId(PRESENTATION_ARTIFACT_KEYS.source),
    title: title || choice || "Presentation source",
    briefRef: {
      activeBriefId: opts?.activeBriefId,
      activeBriefVersion: opts?.activeBriefVersion,
    },
    constraints: Array.isArray(root.constraints)
      ? root.constraints.filter((c): c is string => typeof c === "string")
      : undefined,
    sourceDocuments: choice
      ? [
          {
            id: `doc_${slugifyId(choice, "source")}`,
            title: choice,
            kind: "other",
            summary: choice,
          },
        ]
      : undefined,
    sourceTextExcerpts: excerpts.length ? excerpts : undefined,
    uploadedAssets: uploadedAssets.length ? uploadedAssets : undefined,
    sourceRefs: {
      sourceInputIds: opts?.sourceInputIds,
      activeBriefId: opts?.activeBriefId,
      activeBriefVersion: opts?.activeBriefVersion,
      vaultAssetIds: vaultAssetIds.length ? vaultAssetIds : undefined,
    },
  };
}
