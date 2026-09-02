/**
 * Satisfy required `colors` Brand Memory slot when the brief or metadata already specifies a palette.
 */

import type { BrandMemorySlotKey } from "../platform/os/creative/brand-memory-slots";
import type { BrandContextFact } from "../platform/os/creative/brand-context-packet";
import type { KnowledgeResolveResult } from "../platform/os/creative/knowledge-resolver";
import { resolveBriefBrandColors } from "./brand-color-extraction";

export function applyInlineBriefColorSatisfaction(input: {
  readonly brief: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly resolve: KnowledgeResolveResult;
  readonly storedProfileColors?: readonly string[];
}): KnowledgeResolveResult {
  const inlineColors = resolveBriefBrandColors({
    brief: input.brief,
    metadata: input.metadata,
    storedColors: input.storedProfileColors,
  });

  if (inlineColors.length === 0) return input.resolve;

  const missingRequiredSlots = input.resolve.missingRequiredSlots.filter(
    (slot) => slot !== "colors"
  );

  const hasColorFact = input.resolve.facts.some((f) => f.key === "colors");
  const facts: BrandContextFact[] = hasColorFact
    ? [...input.resolve.facts]
    : [
        ...input.resolve.facts,
        {
          key: "colors",
          value: inlineColors.join(", "),
          tier: "working",
          provenance: "Brief / profile colours",
        },
      ];

  return {
    ...input.resolve,
    missingRequiredSlots,
    facts,
    provenanceParts: input.resolve.provenanceParts.includes("Brief / profile colours")
      ? input.resolve.provenanceParts
      : [...input.resolve.provenanceParts, "Brief / profile colours"],
  };
}

export function metadataBrandColorExtras(input: {
  readonly brief: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly storedProfileColors?: readonly string[];
}): Record<string, unknown> {
  const colors = resolveBriefBrandColors({
    brief: input.brief,
    metadata: input.metadata,
    storedColors: input.storedProfileColors,
  });
  if (!colors.length) return {};
  return {
    brandColors: colors,
    briefExtractedColors: colors,
  };
}

export function colorsSlotSatisfied(input: {
  readonly missingSlots: readonly BrandMemorySlotKey[];
  readonly brief: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly storedProfileColors?: readonly string[];
}): boolean {
  if (!input.missingSlots.includes("colors")) return true;
  return (
    resolveBriefBrandColors({
      brief: input.brief,
      metadata: input.metadata,
      storedColors: input.storedProfileColors,
    }).length > 0
  );
}
