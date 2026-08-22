/**
 * Phase 2 — Presentation verify → reinforce
 *
 * After successful presentation generation: validate MUST USE coverage,
 * reinforce brand preferences on pass, attach fix directive on fail.
 */

import { mergePreferencesIntoProductBrand } from "../platform/business/brand-brain/learning/product-brand-preference-writer";
import {
  buildPresentationGroundingLabels,
  extractPresentationMustUseFacts,
  validatePresentationMustUseCoverage,
  validatePresentationRoutesRelevance,
  type PresentationMeta,
  type PresentationMustUseFact,
} from "../platform/os/delivery/presentation-generation";

export type PresentationVerifyInput = {
  readonly organizationId: string;
  readonly brandId?: string;
  readonly structured: unknown;
  readonly userBrief: string;
  readonly brandName?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly lockedColors?: readonly string[];
  readonly regenerated?: boolean;
};

export type PresentationVerifyResult = {
  readonly checked: boolean;
  readonly passed: boolean;
  readonly reinforced: boolean;
  readonly meta: PresentationMeta;
  readonly fixDirective?: string;
};

export async function verifyAndReinforcePresentationOutput(
  input: PresentationVerifyInput
): Promise<PresentationVerifyResult> {
  const mustUseFacts: PresentationMustUseFact[] =
    Array.isArray(input.metadata?.presentationMustUseFacts) &&
    input.metadata.presentationMustUseFacts.length
      ? (input.metadata.presentationMustUseFacts as PresentationMustUseFact[])
      : extractPresentationMustUseFacts({
          userBrief: input.userBrief,
          brandName: input.brandName,
          metadata: input.metadata,
        });

  const grounding = buildPresentationGroundingLabels({
    brandName: input.brandName,
    facts: mustUseFacts,
  });

  const relevance = validatePresentationRoutesRelevance({
    data: input.structured,
    userBrief: input.userBrief,
    brandName: input.brandName,
  });
  const mustUse = validatePresentationMustUseCoverage({
    data: input.structured,
    facts: mustUseFacts,
  });

  const passed = relevance.ok && mustUse.ok;
  let reinforced = false;

  if (passed) {
    try {
      const mongoose = await import("mongoose");
      if (mongoose.default.connection.readyState === 1) {
        const colors = (input.lockedColors ?? [])
          .map((c) => c.trim())
          .filter(Boolean);
        const tone =
          typeof input.metadata?.brandTone === "string"
            ? input.metadata.brandTone.trim()
            : undefined;
        const result = await mergePreferencesIntoProductBrand({
          organizationId: input.organizationId,
          brandId: input.brandId,
          preferences: {
            ...(colors.length ? { colors } : {}),
            ...(tone ? { toneAdjectives: [tone] } : {}),
            preferredFormats: ["presentation"],
            styleNotes: ["On-brief presentation routes validated"],
          },
          source: "presentation_verify_reinforce",
        });
        reinforced = result.updated === true;
      }
    } catch {
      /* non-fatal */
    }
  }

  let fixDirective: string | undefined;
  if (!passed) {
    const parts: string[] = [
      "Regenerate presentation routes strictly grounded in the client brief and brand.",
    ];
    if (!relevance.ok) {
      parts.push(`Relevance issues: ${relevance.reasons.join(", ")}.`);
    }
    if (!mustUse.ok && mustUse.missing.length) {
      parts.push(
        `Missing MUST USE facts in output: ${mustUse.missing.join(", ")}.`,
      );
    }
    if (input.brandName?.trim()) {
      parts.push(`Include brand "${input.brandName.trim()}" in every deck.`);
    }
    fixDirective = parts.join(" ");
  }

  return {
    checked: true,
    passed,
    reinforced,
    meta: {
      grounding,
      regenerated: input.regenerated === true,
      verifyPassed: passed,
      reinforced,
      ...(!mustUse.ok ? { mustUseMissing: mustUse.missing } : {}),
    },
    fixDirective,
  };
}

/** Fire-and-forget — never throws. */
export function scheduleVerifyAndReinforcePresentationOutput(
  input: PresentationVerifyInput
): void {
  void verifyAndReinforcePresentationOutput(input).catch(() => {
    /* non-fatal */
  });
}
