/**
 * Generic upstream ArtifactVersion → downstream semantic + media projection.
 *
 * Exact X@V identity is always preserved. Semantic projection is independent of
 * visual-byte resolution: structured_data may skip media attachment while still
 * supplying SelectedSemanticDirection for composition / RRC.
 *
 * No serviceId / phaseId / subcategory branches.
 */

import {
  choiceHasAuthoritativeCommunicationFields,
  extractChoiceArrayFromArtifactData,
  semanticFieldNamesOfChoice,
  type SelectedSemanticChoice,
} from "./resolve-selected-choice";
import type { UpstreamArtifactContext } from "./types";

export type UpstreamSemanticProjectionStatus =
  | "resolved"
  | "not_applicable"
  | "unresolved";

export type ResolvedUpstreamArtifactContext = {
  readonly artifactKey: string;
  readonly artifactId: string;
  readonly artifactVersion: number;
  readonly sourcePhase: string;
  readonly sessionRole: UpstreamArtifactContext["sessionRole"];
  readonly required: boolean;
  readonly role: UpstreamArtifactContext["role"];
  readonly structuredData: Record<string, unknown>;
  readonly contentHash?: string;
  readonly provenance: {
    readonly parentArtifactId?: string;
    readonly parentVersion?: number;
  };
  readonly mediaReference: {
    readonly present: boolean;
    readonly vaultAssetId?: string;
  };
  readonly semanticProjection: {
    readonly status: UpstreamSemanticProjectionStatus;
    readonly source:
      | "selected_choice_slice"
      | "structured_payload"
      | "none";
    readonly selectedChoice?: SelectedSemanticChoice;
    readonly semanticFields: readonly string[];
    readonly note: string;
  };
};

function extractVaultHint(data: Record<string, unknown>): string | undefined {
  const candidates = [
    data.vaultAssetId,
    data.assetId,
    data.primaryAssetId,
    (data.media as Record<string, unknown> | undefined)?.vaultAssetId,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return undefined;
}

/**
 * Project one upstream ArtifactVersion into the downstream continuity context.
 * Prefer an already-resolved SelectedSemanticChoice when identity matches.
 */
export function resolveUpstreamArtifactContext(input: {
  readonly upstream: UpstreamArtifactContext;
  readonly selectedChoices?: readonly SelectedSemanticChoice[];
}): ResolvedUpstreamArtifactContext {
  const u = input.upstream;
  const match = (input.selectedChoices ?? []).find(
    (c) =>
      c.artifactId === u.artifactId &&
      c.version === u.version &&
      c.phaseId === u.phaseId,
  );

  const vaultAssetId = extractVaultHint(u.data);
  const choiceSet = extractChoiceArrayFromArtifactData(u.data);

  let semanticProjection: ResolvedUpstreamArtifactContext["semanticProjection"];
  if (match) {
    semanticProjection = {
      status: "resolved",
      source: "selected_choice_slice",
      selectedChoice: match,
      semanticFields: match.semanticFieldNames,
      note: "Exact selected choice slice from parent ArtifactVersion X@V",
    };
  } else if (choiceSet) {
    semanticProjection = {
      status: "unresolved",
      source: "none",
      semanticFields: [],
      note: "Upstream is a selectable choice set but no selectedRouteIndex slice resolved",
    };
  } else if (Object.keys(u.data).length > 0) {
    const fields = semanticFieldNamesOfChoice(u.data);
    semanticProjection = {
      status: fields.length > 0 ? "resolved" : "not_applicable",
      source: fields.length > 0 ? "structured_payload" : "none",
      semanticFields: fields,
      note:
        fields.length > 0
          ? "Non-choice structured payload projected as semantic fields"
          : "Structured payload present without declared semantic direction fields",
    };
  } else {
    semanticProjection = {
      status: "not_applicable",
      source: "none",
      semanticFields: [],
      note: "No structured semantic payload on upstream ArtifactVersion",
    };
  }

  return {
    artifactKey: u.artifactKey,
    artifactId: u.artifactId,
    artifactVersion: u.version,
    sourcePhase: u.phaseId,
    sessionRole: u.sessionRole,
    required: u.required,
    role: u.role,
    structuredData: u.data,
    provenance: {
      ...(u.lineage.parentArtifactId
        ? { parentArtifactId: u.lineage.parentArtifactId }
        : {}),
      ...(u.lineage.parentVersion != null
        ? { parentVersion: u.lineage.parentVersion }
        : {}),
    },
    mediaReference: {
      present: Boolean(vaultAssetId),
      ...(vaultAssetId ? { vaultAssetId } : {}),
    },
    semanticProjection,
  };
}

export function resolveAllUpstreamArtifactContexts(input: {
  readonly upstream: readonly UpstreamArtifactContext[];
  readonly selectedChoices?: readonly SelectedSemanticChoice[];
}): readonly ResolvedUpstreamArtifactContext[] {
  return input.upstream.map((u) =>
    resolveUpstreamArtifactContext({
      upstream: u,
      selectedChoices: input.selectedChoices,
    }),
  );
}

/**
 * When downstream on-asset composition requires rendered communication,
 * at least one selected upstream semantic projection must be resolved
 * (or a newer user instruction will supply the surface later).
 */
export function assertUpstreamSemanticProjectionForOnAsset(input: {
  readonly onAssetRequired: boolean;
  readonly resolvedUpstream: readonly ResolvedUpstreamArtifactContext[];
  readonly hasUserInstruction: boolean;
  readonly selectedChoices: readonly SelectedSemanticChoice[];
}):
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly code: "UPSTREAM_SEMANTIC_PROJECTION_UNRESOLVED";
      readonly message: string;
      readonly details: Record<string, unknown>;
    } {
  if (!input.onAssetRequired) return { ok: true };
  if (input.hasUserInstruction) return { ok: true };
  if (input.selectedChoices.length > 0) {
    const withComm = input.selectedChoices.some((c) =>
      choiceHasAuthoritativeCommunicationFields(c.choice),
    );
    if (withComm) return { ok: true };
    return {
      ok: false,
      code: "UPSTREAM_SEMANTIC_PROJECTION_UNRESOLVED",
      message:
        "Selected upstream ArtifactVersion resolved but lacks authoritative communication fields required for on-asset composition",
      details: {
        selectedChoices: input.selectedChoices.map((c) => ({
          artifactId: c.artifactId,
          artifactVersion: c.version,
          artifactKey: c.artifactKey,
          semanticFieldNames: c.semanticFieldNames,
        })),
      },
    };
  }

  const selectedUpstream = input.resolvedUpstream.filter(
    (u) =>
      u.sessionRole === "selected" ||
      u.role === "selected_reference" ||
      u.required,
  );
  const unresolvedChoiceSets = selectedUpstream.filter(
    (u) => u.semanticProjection.status === "unresolved",
  );
  if (unresolvedChoiceSets.length > 0) {
    return {
      ok: false,
      code: "UPSTREAM_SEMANTIC_PROJECTION_UNRESOLVED",
      message:
        "Required selected upstream ArtifactVersion exists but its semantic projection could not be resolved",
      details: {
        unresolved: unresolvedChoiceSets.map((u) => ({
          artifactKey: u.artifactKey,
          artifactId: u.artifactId,
          artifactVersion: u.artifactVersion,
          sourcePhase: u.sourcePhase,
          note: u.semanticProjection.note,
        })),
      },
    };
  }

  return { ok: true };
}

export function upstreamContinuityDiagnostics(
  resolved: readonly ResolvedUpstreamArtifactContext[],
): Record<string, unknown> {
  return {
    UPSTREAM_SELECTED_ARTIFACT: resolved
      .filter(
        (u) =>
          u.sessionRole === "selected" || u.role === "selected_reference",
      )
      .map((u) => ({
        artifactKey: u.artifactKey,
        artifactId: u.artifactId,
        artifactVersion: u.artifactVersion,
        sourcePhase: u.sourcePhase,
      })),
    UPSTREAM_SEMANTIC_PROJECTION: resolved.map((u) => ({
      artifactKey: u.artifactKey,
      artifactId: u.artifactId,
      artifactVersion: u.artifactVersion,
      resolved: u.semanticProjection.status === "resolved",
      status: u.semanticProjection.status,
      source: u.semanticProjection.source,
      semanticFields: u.semanticProjection.semanticFields,
      mediaPresent: u.mediaReference.present,
      note: u.semanticProjection.note,
    })),
  };
}
