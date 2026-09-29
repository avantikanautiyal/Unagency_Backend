/**
 * Provider-generation projection of upstream ArtifactVersions.
 *
 * Distinguishes:
 *   DEPENDENCY PROVENANCE (exact X@V retained on the CMR part)
 * from
 *   GENERATION INPUT PROJECTION (selected slice vs full sibling dump)
 *
 * No serviceId / phaseId branches — driven by artifactProjectionMode.
 */

import {
  extractChoiceArrayFromArtifactData,
  type SelectedSemanticChoice,
} from "./resolve-selected-choice";
import type { UpstreamArtifactContext } from "./types";

export type ArtifactProjectionMode = "full" | "selected_only";

export function projectUpstreamArtifactDataForGeneration(input: {
  readonly upstream: UpstreamArtifactContext;
  readonly selectedChoices: readonly SelectedSemanticChoice[];
  readonly projectionMode: ArtifactProjectionMode;
}): {
  readonly data: Record<string, unknown>;
  readonly projectionMode: ArtifactProjectionMode;
  readonly projectedSelectedOnly: boolean;
  readonly siblingChoiceCount?: number;
} {
  if (input.projectionMode !== "selected_only") {
    return {
      data: input.upstream.data,
      projectionMode: "full",
      projectedSelectedOnly: false,
    };
  }

  const match = input.selectedChoices.find(
    (c) =>
      c.artifactId === input.upstream.artifactId &&
      c.version === input.upstream.version &&
      c.phaseId === input.upstream.phaseId,
  );
  if (!match) {
    return {
      data: input.upstream.data,
      projectionMode: "full",
      projectedSelectedOnly: false,
    };
  }

  const extracted = extractChoiceArrayFromArtifactData(input.upstream.data);
  if (!extracted) {
    return {
      data: input.upstream.data,
      projectionMode: "full",
      projectedSelectedOnly: false,
    };
  }

  const projected: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input.upstream.data)) {
    if (key === extracted.key) continue;
    projected[key] = value;
  }
  projected[extracted.key] = [match.choice];
  projected.generationProjection = {
    mode: "selected_only",
    choiceArrayKey: extracted.key,
    selectedIndex: match.selectedRouteIndex,
    siblingChoiceCount: extracted.items.length,
    note: "Sibling choices omitted from provider generation projection; exact ArtifactVersion provenance remains on this upstream part.",
  };

  return {
    data: projected,
    projectionMode: "selected_only",
    projectedSelectedOnly: true,
    siblingChoiceCount: extracted.items.length,
  };
}
