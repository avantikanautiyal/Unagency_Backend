/**
 * Generic semantic selection resolution.
 *
 * parent ArtifactVersion X@V + selectedRouteIndex / selection metadata
 *   → exact structured choice object from the parent payload
 *
 * No serviceId / phaseId branches. Choice arrays are discovered from the
 * artifact data shape (routes | options | choices | items | directions | concepts).
 */

import type { CdfContextSelectionRef } from "../context-resolver/types";
import type { UpstreamArtifactContext } from "./types";

const CHOICE_ARRAY_KEYS = [
  "routes",
  "options",
  "choices",
  "items",
  "directions",
  "concepts",
  "candidates",
  "variants",
] as const;

export type SelectedSemanticChoice = {
  readonly phaseId: string;
  readonly artifactId: string;
  readonly version: number;
  readonly artifactKey: string;
  readonly selectedRouteIndex: number;
  /** 1-based option number when referenced as "option N". */
  readonly optionNumber: number;
  readonly label: string;
  readonly choiceArrayKey: string;
  /** Exact structured object at the selected index (parent X@V slice). */
  readonly choice: Record<string, unknown>;
  /** Semantic field names present on the choice (for diagnostics). */
  readonly semanticFieldNames: readonly string[];
};

export type ResolveSelectedSemanticChoicesResult =
  | {
      readonly ok: true;
      readonly choices: readonly SelectedSemanticChoice[];
    }
  | {
      readonly ok: false;
      readonly code: "CDF_SELECTION_REFERENCE_UNRESOLVED";
      readonly message: string;
      readonly details: Record<string, unknown>;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Discover the primary selectable list inside a structured artifact payload.
 * Prefers declared array keys that look like choice sets.
 */
export function extractChoiceArrayFromArtifactData(
  data: unknown,
): { key: string; items: readonly unknown[] } | undefined {
  if (!isRecord(data)) return undefined;
  for (const key of CHOICE_ARRAY_KEYS) {
    const raw = data[key];
    if (Array.isArray(raw) && raw.length > 0 && raw.every((x) => isRecord(x) || typeof x === "string")) {
      return { key, items: raw };
    }
  }
  return undefined;
}

export function semanticFieldNamesOfChoice(
  choice: Record<string, unknown>,
): readonly string[] {
  const preferred = [
    "routeId",
    "name",
    "title",
    "label",
    "creativeIdea",
    "description",
    "summary",
    "visualTreatment",
    "visualDirection",
    "headlineAngle",
    "rationale",
    "why",
    "composition",
    "hierarchy",
    "messaging",
    "communicationObjective",
    "primaryMessage",
    "secondaryMessage",
    "visualConcept",
    "focalPoint",
    "typographyDirection",
    "supportingVisualElements",
    "brandIntegration",
    "identityMarkRole",
    "audienceSignal",
    "useContextIntent",
    "avoidances",
    "visualCharacteristics",
  ];
  const names: string[] = [];
  for (const k of preferred) {
    const v = choice[k];
    if (typeof v === "string" && v.trim()) names.push(k);
    else if (Array.isArray(v) && v.length) names.push(k);
  }
  for (const k of Object.keys(choice)) {
    if (!names.includes(k) && names.length < 24) {
      const v = choice[k];
      if (
        (typeof v === "string" && v.trim()) ||
        (Array.isArray(v) && v.length) ||
        (isRecord(v) && Object.keys(v).length)
      ) {
        names.push(k);
      }
    }
  }
  return Object.freeze(names);
}

function normalizeChoiceRecord(item: unknown, index: number): Record<string, unknown> {
  if (isRecord(item)) return { ...item };
  if (typeof item === "string" && item.trim()) {
    return { name: item.trim(), index };
  }
  return { index };
}

function choiceIdOfItem(item: unknown): string | undefined {
  if (!isRecord(item)) return undefined;
  const id = item.routeId ?? item.id ?? item.choiceId;
  return typeof id === "string" && id.trim() ? id.trim() : undefined;
}

/**
 * Resolve session selections against loaded upstream artifacts into exact
 * structured choice objects. Fail closed when a selection index/choiceId cannot
 * be mapped into the parent artifact's choice array.
 */
export function resolveSelectedSemanticChoices(input: {
  readonly selections: readonly CdfContextSelectionRef[];
  readonly upstream: readonly UpstreamArtifactContext[];
  /** When true, out-of-range indexes against a choice array fail (default true). */
  readonly failClosed?: boolean;
  /**
   * Phase IDs whose selection must resolve (required selected_reference parents
   * with choice arrays). Missing parents for other phases are skipped.
   */
  readonly requirePhaseIds?: readonly string[];
}): ResolveSelectedSemanticChoicesResult {
  const failClosed = input.failClosed !== false;
  const out: SelectedSemanticChoice[] = [];

  for (const sel of input.selections) {
    const hasChoiceId = Boolean(sel.choiceId?.trim());
    const hasIndex =
      sel.routeIndex != null && Number.isInteger(sel.routeIndex);
    if (!hasChoiceId && !hasIndex) {
      continue;
    }

    const upstream =
      input.upstream.find(
        (u) =>
          u.phaseId === sel.phaseId &&
          (u.sessionRole === "selected" ||
            u.role === "selected_reference" ||
            u.sessionRole === "approved"),
      ) ??
      input.upstream.find((u) => u.phaseId === sel.phaseId);

    if (!upstream) {
      if (
        failClosed &&
        input.requirePhaseIds?.includes(sel.phaseId)
      ) {
        return {
          ok: false,
          code: "CDF_SELECTION_REFERENCE_UNRESOLVED",
          message: `No upstream artifact loaded for selected phase "${sel.phaseId}"`,
          details: {
            phaseId: sel.phaseId,
            routeIndex: sel.routeIndex ?? null,
            choiceId: sel.choiceId ?? null,
          },
        };
      }
      continue;
    }

    const extracted = extractChoiceArrayFromArtifactData(upstream.data);
    if (!extracted) {
      if (
        isRecord(upstream.data) &&
        Object.keys(upstream.data).length > 0 &&
        input.requirePhaseIds?.includes(sel.phaseId) &&
        hasIndex
      ) {
        out.push({
          phaseId: sel.phaseId,
          artifactId: upstream.artifactId,
          version: upstream.version,
          artifactKey: upstream.artifactKey,
          selectedRouteIndex: sel.routeIndex!,
          optionNumber: sel.routeIndex! + 1,
          label: sel.label,
          choiceArrayKey: "(root)",
          choice: { ...upstream.data },
          semanticFieldNames: semanticFieldNamesOfChoice(upstream.data),
        });
      }
      continue;
    }

    let resolvedIndex: number | null = null;
    const choiceId = sel.choiceId?.trim();
    if (choiceId) {
      const byId = extracted.items.findIndex(
        (item) => choiceIdOfItem(item) === choiceId,
      );
      if (byId < 0) {
        if (failClosed) {
          return {
            ok: false,
            code: "CDF_SELECTION_REFERENCE_UNRESOLVED",
            message: `choiceId "${choiceId}" not found in ${upstream.artifactKey} (${extracted.items.length} choices)`,
            details: {
              phaseId: sel.phaseId,
              choiceId,
              choiceCount: extracted.items.length,
              artifactId: upstream.artifactId,
              version: upstream.version,
            },
          };
        }
        continue;
      }
      resolvedIndex = byId;
    } else {
      if (sel.routeIndex! < 0) {
        if (failClosed) {
          return {
            ok: false,
            code: "CDF_SELECTION_REFERENCE_UNRESOLVED",
            message: `Selection for phase "${sel.phaseId}" has invalid routeIndex ${sel.routeIndex}`,
            details: { phaseId: sel.phaseId, routeIndex: sel.routeIndex },
          };
        }
        continue;
      }
      if (sel.routeIndex! >= extracted.items.length) {
        if (failClosed) {
          return {
            ok: false,
            code: "CDF_SELECTION_REFERENCE_UNRESOLVED",
            message: `selectedRouteIndex ${sel.routeIndex} out of range for ${upstream.artifactKey} (${extracted.items.length} choices)`,
            details: {
              phaseId: sel.phaseId,
              routeIndex: sel.routeIndex,
              choiceCount: extracted.items.length,
              artifactId: upstream.artifactId,
              version: upstream.version,
            },
          };
        }
        continue;
      }
      resolvedIndex = sel.routeIndex!;
    }

    const choice = normalizeChoiceRecord(
      extracted.items[resolvedIndex],
      resolvedIndex,
    );
    out.push({
      phaseId: sel.phaseId,
      artifactId: upstream.artifactId,
      version: upstream.version,
      artifactKey: upstream.artifactKey,
      selectedRouteIndex: resolvedIndex,
      optionNumber: resolvedIndex + 1,
      label: sel.label,
      choiceArrayKey: extracted.key,
      choice,
      semanticFieldNames: semanticFieldNamesOfChoice(choice),
    });
  }

  return { ok: true, choices: Object.freeze(out) };
}

/**
 * True when a structured choice object carries at least one authoritative
 * on-asset communication field used by slotsFromCreativeDirection /
 * DeliverableCompositionContract RRC resolution.
 */
export function choiceHasAuthoritativeCommunicationFields(
  choice: Readonly<Record<string, unknown>>,
): boolean {
  const keys = [
    "primaryMessage",
    "headlineAngle",
    "communicationObjective",
    "secondaryMessage",
    "messaging",
  ] as const;
  return keys.some((k) => {
    const v = choice[k];
    return typeof v === "string" && v.trim().length > 0;
  });
}

/**
 * Prefer the selected semantic choice that can satisfy required on-asset
 * communication surfaces. Generic — no service/phase branches. When none
 * carry communication fields, fall back to the first resolved choice.
 */
export function selectSemanticChoiceForComposition(
  choices: readonly SelectedSemanticChoice[],
): SelectedSemanticChoice | undefined {
  if (choices.length === 0) return undefined;
  const withComm = choices.find((c) =>
    choiceHasAuthoritativeCommunicationFields(c.choice),
  );
  return withComm ?? choices[0];
}

/** True when artifact data looks like a multi-choice selectable payload. */
export function artifactDataLooksLikeChoiceSet(data: unknown): boolean {
  return extractChoiceArrayFromArtifactData(data) != null;
}
