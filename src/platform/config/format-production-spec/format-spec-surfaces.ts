/**
 * Phase 4 — Spec surfaces for Admin QC + FE pixel register sync.
 * Single catalog → generated frontend artifacts (see scripts/generate-format-spec-surfaces.ts).
 */

import { UNIVERSAL_QC_CHECKLIST_LABELS, resolveQcChecklistLabels } from "./qc-checklist";
import {
  getProductionRuleById,
  listFormatToRuleIdEntries,
  listServiceDefaultRules,
} from "./resolve-production-rule";
import {
  FORMAT_PRODUCTION_SPEC_EDITION,
  PRODUCTION_SPEC_STACK_PROVENANCE,
} from "./edition";

export type SpecPixelMaster = {
  readonly formatId: string;
  readonly width: number;
  readonly height: number;
  readonly ruleId: string;
  readonly platform: string;
  readonly status: string;
};

/**
 * C29 format id → Spec master pixels, derived from FORMAT_TO_RULE_ID + rule canvas.
 * When the same formatId appears on multiple platforms with the same canvas, one entry.
 * Conflicting sizes prefer the first mapping (stable Object.entries order).
 */
export function listSpecPixelMasters(): readonly SpecPixelMaster[] {
  const byFormat = new Map<string, SpecPixelMaster>();
  for (const entry of listFormatToRuleIdEntries()) {
    if (byFormat.has(entry.formatId)) continue;
    const rule = getProductionRuleById(entry.ruleId);
    const canvas = rule?.canvas;
    if (!canvas || canvas.unit !== "px") continue;
    byFormat.set(
      entry.formatId,
      Object.freeze({
        formatId: entry.formatId,
        width: canvas.width,
        height: canvas.height,
        ruleId: entry.ruleId,
        platform: entry.platform,
        status: rule!.status,
      }),
    );
  }
  return Object.freeze([...byFormat.values()]);
}

export type ServiceQcLabelCatalog = {
  readonly service: string;
  readonly labels: readonly string[];
};

/**
 * Per-service Admin QC label catalog (universal excluded — callers prepend).
 * Built from service-default rules' before/howto + Gate hygiene.
 */
export function buildServiceQcLabelCatalog(): readonly ServiceQcLabelCatalog[] {
  const byService = new Map<string, string[]>();
  const seenByService = new Map<string, Set<string>>();

  for (const rule of listServiceDefaultRules()) {
    const svc = rule.service;
    if (!byService.has(svc)) {
      byService.set(svc, []);
      seenByService.set(svc, new Set());
    }
    const labels = byService.get(svc)!;
    const seen = seenByService.get(svc)!;

    const push = (label: string) => {
      if (seen.has(label)) return;
      seen.add(label);
      labels.push(label);
    };

    for (const line of rule.beforeCreateChecks ?? []) push(line);
    for (const line of rule.howToCreate ?? []) push(line);
    for (const check of rule.hygieneChecks ?? []) {
      if (check.weight === "gate") push(`[Gate] ${check.passDefinition}`);
    }
  }

  return Object.freeze(
    [...byService.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([service, labels]) =>
        Object.freeze({
          service,
          labels: Object.freeze(labels),
        }),
      ),
  );
}

export function getUniversalQcLabels(): readonly string[] {
  return UNIVERSAL_QC_CHECKLIST_LABELS;
}

/** Snapshot payload written by the generator script. */
export function buildFormatSpecSurfacesSnapshot(): {
  readonly edition: typeof FORMAT_PRODUCTION_SPEC_EDITION;
  readonly provenance: typeof PRODUCTION_SPEC_STACK_PROVENANCE;
  readonly generatedAt: string;
  readonly pixels: readonly SpecPixelMaster[];
  readonly qcByService: readonly ServiceQcLabelCatalog[];
  readonly universalQc: readonly string[];
  /** Example resolved labels for social/content-design (sanity). */
  readonly sampleSocialLabels: readonly string[];
} {
  return Object.freeze({
    edition: FORMAT_PRODUCTION_SPEC_EDITION,
    provenance: PRODUCTION_SPEC_STACK_PROVENANCE,
    generatedAt: new Date().toISOString(),
    pixels: listSpecPixelMasters(),
    qcByService: buildServiceQcLabelCatalog(),
    universalQc: getUniversalQcLabels(),
    sampleSocialLabels: resolveQcChecklistLabels({
      service: "social",
      subtype: "content-design",
    }),
  });
}
