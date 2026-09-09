/**
 * Universal release gates — Hygiene Reference HYGIENE 01.
 * Always-on catalog; rules may subset via ProductionRule.universalGateIds.
 */

import type {
  ProductionHygieneCheck,
  UniversalGateId,
} from "./types";

export type UniversalReleaseGate = ProductionHygieneCheck & {
  readonly id: UniversalGateId;
  readonly weight: "gate";
};

const gate = (
  id: UniversalGateId,
  passDefinition: string,
  promptLine: string,
  evaluationMethod: UniversalReleaseGate["evaluationMethod"] = "NOT_AUTOMATED",
): UniversalReleaseGate =>
  Object.freeze({
    id,
    weight: "gate" as const,
    evaluationMethod,
    passDefinition,
    promptLine,
  });

/**
 * Ordered universal release gates from the Service & Hygiene Reference.
 * A visual quality score cannot cancel a failed gate.
 */
export const UNIVERSAL_RELEASE_GATES: readonly UniversalReleaseGate[] =
  Object.freeze([
    gate(
      "brief",
      "Objective, audience, output, channel, quantity and due date confirmed.",
      "Confirm approved brief: objective, audience, output, channel, quantity, due date.",
    ),
    gate(
      "identity",
      "Correct wordmark and approved color treatment; no unintended external brands.",
      "Use only the approved UNAGENCY / brand wordmark and color treatment; no competitor or unrelated marks.",
    ),
    gate(
      "copy",
      "Names, grammar, numbers, language, CTA and any disclosures approved.",
      "Use only approved copy: names, grammar, numbers, language, CTA, and required disclosures.",
    ),
    gate(
      "rights",
      "Use permissions and any expiry/territory restrictions documented.",
      "Respect documented rights, expiry, and territory restrictions for all assets.",
    ),
    gate(
      "technical",
      "File opens, size/ratio/unit and output method match specification.",
      "Match the specified canvas size, ratio, colour space, and output method exactly.",
      "MEASURED",
    ),
    gate(
      "readability",
      "Essential content survives intended size, crop, UI overlay and viewing distance.",
      "Keep essential content readable at intended size, crop, overlay, and viewing distance.",
      "HEURISTIC",
    ),
    gate(
      "destination",
      "Links, QR codes and native actions reach correct approved destination.",
      "Every link, QR, and native action must reach the approved destination only.",
    ),
    gate(
      "source_package",
      "Editable files, dependencies and exports correspond to the same revision.",
      "Editable sources, dependencies, and exports must correspond to the same revision.",
    ),
    gate(
      "approval",
      "Creator and independent reviewer sign the exact final version.",
      "Final output requires creator and independent reviewer approval of the exact version.",
    ),
  ]);

const BY_ID: ReadonlyMap<UniversalGateId, UniversalReleaseGate> = new Map(
  UNIVERSAL_RELEASE_GATES.map((g) => [g.id, g]),
);

export const ALL_UNIVERSAL_GATE_IDS: readonly UniversalGateId[] = Object.freeze(
  UNIVERSAL_RELEASE_GATES.map((g) => g.id),
);

export function getUniversalReleaseGate(
  id: UniversalGateId,
): UniversalReleaseGate | undefined {
  return BY_ID.get(id);
}

/**
 * Resolve which universal gates apply for a rule.
 * Empty / omitted `universalGateIds` → full catalog.
 */
export function resolveUniversalReleaseGates(
  gateIds?: readonly UniversalGateId[],
): readonly UniversalReleaseGate[] {
  if (!gateIds || gateIds.length === 0) {
    return UNIVERSAL_RELEASE_GATES;
  }
  const out: UniversalReleaseGate[] = [];
  const seen = new Set<UniversalGateId>();
  for (const id of gateIds) {
    if (seen.has(id)) continue;
    const g = BY_ID.get(id);
    if (!g) continue;
    seen.add(id);
    out.push(g);
  }
  return Object.freeze(out);
}
