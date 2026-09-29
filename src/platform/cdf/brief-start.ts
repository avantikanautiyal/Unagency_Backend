/**
 * After submit_brief, skip config gates already answered by product selection.
 *
 * Authority: phase.productSelectionAutoAdvance on the canonical registry.
 * Never branches on serviceId / phaseId.
 */

import type {
  CdfApprovedPhase,
  CdfFlowPhase,
  CdfServiceConfig,
} from "./types";
import {
  resolveCdfCanonicalService,
  type CdfPhaseDefinition,
  type CdfProductSelectionAutoAdvance,
} from "./canonical";

export type CdfProductSelectionHints = {
  platform?: string | null;
  format?: string | null;
  subtype?: string | null;
  category?: string | null;
};

export type CdfPostBriefStart = {
  phaseIndex: number;
  phase: CdfFlowPhase | null;
  autoApproved: CdfApprovedPhase[];
  mastersPatch: Record<string, string>;
  skippedGateAck?: string;
};

function norm(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/[_-]+/g, " ");
}

function hintValue(
  hints: CdfProductSelectionHints | null | undefined,
  hint: CdfProductSelectionAutoAdvance["hint"],
): string {
  if (!hints) return "";
  if (hint === "platform") return hints.platform?.trim() || "";
  if (hint === "format") {
    return hints.format?.trim() || hints.subtype?.trim() || "";
  }
  if (hint === "subtype") return hints.subtype?.trim() || "";
  if (hint === "category") return hints.category?.trim() || "";
  return "";
}

function resolveRouteIndex(
  phase: CdfFlowPhase,
  policy: CdfProductSelectionAutoAdvance,
  value: string,
): number {
  const routes = phase.routes ?? [];
  if (!routes.length) return 0;

  if (policy.routeResolution === "prefer_label_pattern") {
    const pattern = (policy.preferLabelPattern ?? "").trim();
    if (pattern) {
      let re: RegExp;
      try {
        re = new RegExp(pattern, "i");
      } catch {
        re = new RegExp(
          pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
          "i",
        );
      }
      const idx = routes.findIndex((r) =>
        re.test(String(r.label || r.title || "")),
      );
      if (idx >= 0) return idx;
    }
    return Math.min(1, routes.length - 1);
  }

  // match_hint_label
  const p = norm(value);
  if (!p) return 0;
  const exact = routes.findIndex((r) => {
    const label = norm(r.label || r.title);
    return label === p || label.includes(p) || p.includes(label);
  });
  return exact >= 0 ? exact : 0;
}

/**
 * Walk leading phases that declare productSelectionAutoAdvance while the
 * corresponding product hint is present. Stops at the first phase without
 * a policy or without a usable hint.
 */
export function resolveCdfPostBriefStart(input: {
  config: CdfServiceConfig;
  selection?: CdfProductSelectionHints | null;
}): CdfPostBriefStart {
  const { config, selection } = input;
  const now = new Date().toISOString();
  const autoApproved: CdfApprovedPhase[] = [];
  const mastersPatch: Record<string, string> = {};
  let phaseIndex = 0;
  const skipped: string[] = [];

  const canonical = resolveCdfCanonicalService(config.serviceId);
  const ordered: readonly CdfPhaseDefinition[] = canonical?.phases ?? [];

  for (let i = 0; i < config.phases.length; i++) {
    const flowPhase = config.phases[i]!;
    const def =
      ordered.find((p) => p.phaseId === flowPhase.id) ?? ordered[i];
    const policy = def?.productSelectionAutoAdvance;
    if (!policy) break;

    const value = hintValue(selection, policy.hint);
    if (!value) break;

    const routeIndex = resolveRouteIndex(flowPhase, policy, value);
    const route = flowPhase.routes?.[routeIndex];
    const label =
      policy.routeResolution === "prefer_label_pattern"
        ? route?.label || "Use Platform Size"
        : route?.label || value;

    autoApproved.push({
      phaseId: flowPhase.id,
      approvedAt: now,
      selectedRouteIndex: routeIndex,
      selectedRouteLabel: label,
      note: `Preselected from product picker: ${label}`,
    });

    if (policy.hint === "platform" || i === 0) {
      mastersPatch.routeId = label;
      mastersPatch.routeTitle = route?.title || label;
      if (route?.desc) mastersPatch.routeDesc = route.desc;
    }

    skipped.push(
      policy.routeResolution === "prefer_label_pattern" ? value : label,
    );
    phaseIndex = i + 1;
  }

  const phase = config.phases[phaseIndex] ?? null;
  const skippedGateAck =
    skipped.length > 0
      ? `Got it — I've read your brief. Using ${skipped.join(" · ")} from your selection.`
      : undefined;

  return {
    phaseIndex,
    phase,
    autoApproved,
    mastersPatch,
    ...(skippedGateAck ? { skippedGateAck } : {}),
  };
}
