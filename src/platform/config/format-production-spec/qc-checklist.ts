/**
 * Build QC checklist items from Format & Production Spec rules + universal hygiene.
 * Phase 6 folds Visual Field Guide Check first / Check last into Admin QC.
 */

import {
  getProductionRuleById,
  resolveProductionRule,
} from "./resolve-production-rule";
import { SERVICE_SUBTYPE_TO_RULE_ID } from "./rules/service-defaults";
import type { ProductionRule, ResolveProductionRuleInput } from "./types";
import { getServiceVisualRecipe } from "./visual-field-guide";

/** Always-on brand / delivery hygiene (Admin QC base). */
export const UNIVERSAL_QC_CHECKLIST_LABELS = Object.freeze([
  "Brand guidelines followed",
  "Correct logo / lockup usage",
  "Typography matches brand deck",
  "Color contrast acceptable",
  "Copy spelling & grammar",
  "Output formats complete",
] as const);

export type QcChecklistItem = {
  readonly id: string;
  readonly label: string;
  readonly source: "universal" | "production-spec";
};

function appendRuleChecks(
  items: QcChecklistItem[],
  rule: ProductionRule,
  seen: Set<string>,
): void {
  let idx = 0;
  for (const label of rule.beforeCreateChecks ?? []) {
    if (seen.has(label)) continue;
    seen.add(label);
    items.push(
      Object.freeze({
        id: `spec.before.${rule.id}.${idx++}`,
        label,
        source: "production-spec" as const,
      }),
    );
  }
  idx = 0;
  for (const label of rule.howToCreate ?? []) {
    if (seen.has(label)) continue;
    seen.add(label);
    items.push(
      Object.freeze({
        id: `spec.howto.${rule.id}.${idx++}`,
        label,
        source: "production-spec" as const,
      }),
    );
  }
  // Phase 4 — structured Gate hygiene (same lines fed into prompts).
  for (const check of rule.hygieneChecks ?? []) {
    if (check.weight !== "gate") continue;
    const label = `[Gate] ${check.passDefinition}`;
    if (seen.has(label)) continue;
    seen.add(label);
    items.push(
      Object.freeze({
        id: `spec.hygiene.${rule.id}.${check.id}`,
        label,
        source: "production-spec" as const,
      }),
    );
  }
}

/**
 * Merge universal hygiene with Spec beforeCreate / howToCreate checks for the
 * resolved placement and/or service default.
 */
export function resolveQcChecklistItems(
  input: ResolveProductionRuleInput = {},
): readonly QcChecklistItem[] {
  const items: QcChecklistItem[] = UNIVERSAL_QC_CHECKLIST_LABELS.map((label, i) =>
    Object.freeze({
      id: `universal.${i}`,
      label,
      source: "universal" as const,
    }),
  );

  const seen = new Set<string>([...UNIVERSAL_QC_CHECKLIST_LABELS]);
  const resolved = resolveProductionRule(input);

  if (resolved) {
    appendRuleChecks(items, resolved.rule, seen);

    if (resolved.rule.canvas) {
      const unit = resolved.rule.canvas.unit;
      const label = `Canvas matches Spec ${resolved.rule.id}: ${resolved.rule.canvas.width}×${resolved.rule.canvas.height}${unit} (status ${resolved.rule.status})`;
      if (!seen.has(label)) {
        seen.add(label);
        items.push(
          Object.freeze({
            id: `spec.canvas.${resolved.rule.id}`,
            label,
            source: "production-spec" as const,
          }),
        );
      }
    }

    if (resolved.rule.status === "R" || resolved.rule.status === "H") {
      const label = `Status ${resolved.rule.status}: current platform/vendor/booked spec confirmed before approval`;
      if (!seen.has(label)) {
        seen.add(label);
        items.push(
          Object.freeze({
            id: `spec.authority.${resolved.rule.id}`,
            label,
            source: "production-spec" as const,
          }),
        );
      }
    }
  }

  // When a platform card matched but has no hygiene lines, fold in service default checks.
  if (input.service && input.subtype && resolved?.matchedBy !== "serviceDefault") {
    const svc = input.service.trim().toLowerCase();
    const sub = input.subtype.trim().toLowerCase();
    const mapped = SERVICE_SUBTYPE_TO_RULE_ID[`${svc}/${sub}`];
    const serviceRule = mapped ? getProductionRuleById(mapped) : undefined;
    if (serviceRule && serviceRule.id !== resolved?.rule.id) {
      appendRuleChecks(items, serviceRule, seen);
    }
  }

  // Phase 6 — Visual Field Guide Check first / Check last.
  const recipe = getServiceVisualRecipe(
    input.service ?? resolved?.rule.service,
  );
  if (recipe) {
    for (const check of [...recipe.checkFirst, ...recipe.checkLast]) {
      const prefix = recipe.checkFirst.includes(check)
        ? "Check first"
        : "Check last";
      const label = `[VFG ${prefix}] ${check.passDefinition}`;
      if (seen.has(label)) continue;
      seen.add(label);
      items.push(
        Object.freeze({
          id: `vfg.${recipe.service}.${check.id}`,
          label,
          source: "production-spec" as const,
        }),
      );
    }
  }

  return Object.freeze(items);
}

export function resolveQcChecklistLabels(
  input: ResolveProductionRuleInput = {},
): readonly string[] {
  return Object.freeze(resolveQcChecklistItems(input).map((i) => i.label));
}
