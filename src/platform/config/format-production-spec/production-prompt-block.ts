/**
 * Build a deterministic [UNAGENCY Production Spec] prompt block from a rule.
 *
 * Phase 1: Injected via apply-production-spec-instruct into execution
 * instructions, metadata binding, and provider-facing prompts.
 * Phase 6: Appends Visual Field Guide identity / layout / service recipe.
 * Instruct and enforce must share the same productionRuleId + contentHash.
 */

import { createHash } from "crypto";
import {
  FORMAT_PRODUCTION_SPEC_EDITION,
  PRODUCTION_SPEC_STACK_PROVENANCE,
} from "./edition";
import type {
  AuthorityStatus,
  ProductionHygieneCheck,
  ProductionRule,
} from "./types";
import { resolveUniversalReleaseGates } from "./universal-release-gates";
import {
  resolveVisualFieldGuide,
  visualFinalHygienePromptLines,
} from "./visual-field-guide";

function gcd(a: number, b: number): number {
  let x = Math.abs(Math.trunc(a));
  let y = Math.abs(Math.trunc(b));
  while (y !== 0) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}

function aspectRatioLabel(width: number, height: number): string {
  const d = gcd(width, height);
  return `${width / d}:${height / d}`;
}

/** Prompt-block schema version — bump when section order/semantics change. */
export const PRODUCTION_PROMPT_BLOCK_VERSION = "1.1.0" as const;

export const PRODUCTION_PROMPT_BLOCK_HEADER =
  "[UNAGENCY Production Spec]" as const;

export type ProductionPromptBlockSectionId =
  | "header"
  | "placement"
  | "canvas"
  | "authority"
  | "identity_system"
  | "layout_hygiene"
  | "placement_hygiene"
  | "format_logic"
  | "service_visual_recipe"
  | "good_practice"
  | "final_hygiene"
  | "hard_gates"
  | "weighted_targets"
  | "before_create"
  | "how_to_create"
  | "export"
  | "technical"
  | "universal_gates"
  | "production_note";

export type ProductionPromptBlockSection = {
  readonly id: ProductionPromptBlockSectionId;
  readonly title: string;
  readonly lines: readonly string[];
};

export type ProductionPromptBlock = {
  readonly version: typeof PRODUCTION_PROMPT_BLOCK_VERSION;
  readonly productionRuleId: string;
  readonly edition: typeof FORMAT_PRODUCTION_SPEC_EDITION;
  readonly provenance: typeof PRODUCTION_SPEC_STACK_PROVENANCE;
  readonly authorityStatus: AuthorityStatus;
  readonly sections: readonly ProductionPromptBlockSection[];
  /** Flattened provider-facing text (deterministic). */
  readonly text: string;
  /** Gate / HARD prompt lines only. */
  readonly hardConstraintLines: readonly string[];
  /** Weighted house-target prompt lines. */
  readonly softTargetLines: readonly string[];
  /** Stable hash of `text` for telemetry / binding (Phase 5). */
  readonly contentHash: string;
};

export type BuildProductionPromptBlockInput = {
  readonly rule: ProductionRule;
  /** Override display placement label when product path differs from rule.placement. */
  readonly placementLabel?: string;
  /** Include universal HYGIENE 01 gates (default true). */
  readonly includeUniversalGates?: boolean;
  /**
   * Include Visual Field Guide identity/layout/recipe sections (default true).
   * Phase 6 — every provider create path should leave this on.
   */
  readonly includeVisualFieldGuide?: boolean;
  /** Override service slug used to resolve the Field Guide recipe. */
  readonly visualFieldGuideService?: string;
  /**
   * Cap weighted lines to control prompt bloat (default: no cap).
   * Gate lines are never capped.
   */
  readonly maxWeightedLines?: number;
  /** Cap good-practice lines (default: all). */
  readonly maxGoodPracticeLines?: number;
};

const AUTHORITY_LABEL: Readonly<Record<AuthorityStatus, string>> = Object.freeze({
  D: "House default — use unless booked placement / vendor template overrides",
  V: "Verified cited fact — treat canvas and notes as exact within cited scope",
  R: "Review required — confirm current owner/platform/vendor specification before treating as approved",
  H: "Hold — do not produce as an approved output without confirmed override",
});

function freezeSection(
  id: ProductionPromptBlockSectionId,
  title: string,
  lines: readonly string[],
): ProductionPromptBlockSection | undefined {
  const cleaned = lines.map((l) => l.trim()).filter(Boolean);
  if (cleaned.length === 0) return undefined;
  return Object.freeze({
    id,
    title,
    lines: Object.freeze([...cleaned]),
  });
}

function formatCanvasLine(rule: ProductionRule): string | undefined {
  const c = rule.canvas;
  if (!c) return undefined;
  const aspect =
    c.unit === "px" ? aspectRatioLabel(c.width, c.height) : undefined;
  const aspectPart = aspect ? `; aspect ${aspect}` : "";
  return `Canvas: ${c.width}×${c.height} ${c.unit}${aspectPart}`;
}

function formatAuthorityLine(rule: ProductionRule): string {
  const citation = rule.sourceRef ? ` (${rule.sourceRef})` : "";
  return `Authority: ${rule.status}${citation} — ${AUTHORITY_LABEL[rule.status]}`;
}

function formatPlacementLines(
  rule: ProductionRule,
  placementLabel?: string,
): readonly string[] {
  const placement = placementLabel?.trim() || rule.placement;
  const parts = [
    `Rule id: ${rule.id}`,
    `Service: ${rule.service}`,
  ];
  if (rule.subtype) parts.push(`Subtype: ${rule.subtype}`);
  if (rule.platform) parts.push(`Platform: ${rule.platform}`);
  parts.push(`Placement: ${placement}`);
  parts.push(
    'Name the exact intended placement; never approve or generate a single asset for "All".',
  );
  return parts;
}

function formatExportLines(rule: ProductionRule): readonly string[] {
  const exp = rule.export;
  if (!exp) return [];
  const lines = [`Export formats: ${exp.formats.join(", ")}`];
  if (exp.notes?.trim()) lines.push(`Export notes: ${exp.notes.trim()}`);
  return lines;
}

function formatTechnicalLines(rule: ProductionRule): readonly string[] {
  const lines: string[] = [];
  if (rule.colour) lines.push(`Colour space: ${rule.colour}`);
  if (rule.print?.bleedMm != null) {
    lines.push(`Print bleed starting point: ${rule.print.bleedMm} mm`);
  }
  if (rule.print?.effectivePpi != null) {
    lines.push(`Effective PPI target: ${rule.print.effectivePpi}`);
  }
  return lines;
}

function splitHygieneChecks(
  checks: readonly ProductionHygieneCheck[],
  maxWeightedLines?: number,
): {
  readonly gates: readonly ProductionHygieneCheck[];
  readonly weighted: readonly ProductionHygieneCheck[];
} {
  const gates = checks.filter((c) => c.weight === "gate");
  let weighted = checks.filter((c) => c.weight === "weighted");
  if (
    typeof maxWeightedLines === "number" &&
    Number.isFinite(maxWeightedLines) &&
    maxWeightedLines >= 0
  ) {
    weighted = weighted.slice(0, Math.floor(maxWeightedLines));
  }
  return {
    gates: Object.freeze([...gates]),
    weighted: Object.freeze([...weighted]),
  };
}

function renderSectionsAsText(
  sections: readonly ProductionPromptBlockSection[],
): string {
  const chunks: string[] = [];
  for (const section of sections) {
    if (section.id === "header") {
      chunks.push(section.lines.join("\n"));
      continue;
    }
    chunks.push(`${section.title}:`);
    for (const line of section.lines) {
      chunks.push(`- ${line}`);
    }
  }
  return chunks.join("\n");
}

function hashText(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex").slice(0, 16);
}

/**
 * Build a frozen ProductionPromptBlock for a resolved production rule.
 * Safe to call with today's catalog (no hygieneChecks) — falls back to
 * beforeCreate / howToCreate strings for soft guidance.
 * Phase 6 injects Visual Field Guide identity / layout / service recipe.
 */
export function buildProductionPromptBlock(
  input: BuildProductionPromptBlockInput,
): ProductionPromptBlock {
  const { rule } = input;
  const includeUniversal = input.includeUniversalGates !== false;
  const includeVfg = input.includeVisualFieldGuide !== false;
  const structured = splitHygieneChecks(
    rule.hygieneChecks ?? [],
    input.maxWeightedLines,
  );

  const hardLines: string[] = structured.gates.map((c) => c.promptLine);
  const softLines: string[] = structured.weighted.map((c) => c.promptLine);

  // Fallback: when structured hygiene is absent, surface checklist strings
  // as soft targets so Phase 1 can still inject useful guidance.
  const beforeCreate = [...(rule.beforeCreateChecks ?? [])];
  const howToCreate = [...(rule.howToCreate ?? [])];
  if (structured.gates.length === 0 && structured.weighted.length === 0) {
    for (const line of [...beforeCreate, ...howToCreate]) {
      if (line.trim()) softLines.push(line.trim());
    }
  }

  const universal = includeUniversal
    ? resolveUniversalReleaseGates(rule.universalGateIds)
    : [];
  for (const g of universal) {
    hardLines.push(g.promptLine);
  }

  const vfg = includeVfg
    ? resolveVisualFieldGuide({
        service: input.visualFieldGuideService ?? rule.service,
      })
    : undefined;

  const sections: ProductionPromptBlockSection[] = [];

  const header = freezeSection("header", "Header", [
    PRODUCTION_PROMPT_BLOCK_HEADER,
    `Provenance: ${PRODUCTION_SPEC_STACK_PROVENANCE}`,
  ]);
  if (header) sections.push(header);

  const placement = freezeSection(
    "placement",
    "Placement",
    formatPlacementLines(rule, input.placementLabel),
  );
  if (placement) sections.push(placement);

  const canvasLine = formatCanvasLine(rule);
  const canvas = freezeSection(
    "canvas",
    "Canvas",
    canvasLine ? [canvasLine] : [],
  );
  if (canvas) sections.push(canvas);

  const authority = freezeSection("authority", "Authority", [
    formatAuthorityLine(rule),
  ]);
  if (authority) sections.push(authority);

  if (vfg) {
    const identity = freezeSection(
      "identity_system",
      "Visual Field Guide — Identity",
      vfg.identity.lines,
    );
    if (identity) sections.push(identity);

    const layout = freezeSection(
      "layout_hygiene",
      "Visual Field Guide — Layout",
      vfg.layout.lines,
    );
    if (layout) sections.push(layout);

    const placementH = freezeSection(
      "placement_hygiene",
      "Visual Field Guide — Placement hygiene",
      vfg.placement.lines,
    );
    if (placementH) sections.push(placementH);

    const formatLogic = freezeSection(
      "format_logic",
      "Visual Field Guide — Format logic",
      vfg.formatLogic.lines,
    );
    if (formatLogic) sections.push(formatLogic);

    if (vfg.recipe) {
      const recipeLines = [
        `SERVICE ${vfg.recipe.serviceNumber} — ${vfg.recipe.title}`,
        vfg.recipe.mantra,
        vfg.recipe.compositionPrompt,
        ...vfg.recipe.checkFirst.map((c) => `Check first [${c.id}]: ${c.promptLine}`),
        ...vfg.recipe.checkLast.map((c) => `Check last [${c.id}]: ${c.promptLine}`),
      ];
      const recipe = freezeSection(
        "service_visual_recipe",
        "Visual Field Guide — Service recipe",
        recipeLines,
      );
      if (recipe) sections.push(recipe);
    }

    let practiceLines = vfg.goodPractice.map((g) => g.promptLine);
    if (
      typeof input.maxGoodPracticeLines === "number" &&
      Number.isFinite(input.maxGoodPracticeLines) &&
      input.maxGoodPracticeLines >= 0
    ) {
      practiceLines = practiceLines.slice(
        0,
        Math.floor(input.maxGoodPracticeLines),
      );
    }
    const practice = freezeSection(
      "good_practice",
      "Visual Field Guide — Good practice",
      practiceLines,
    );
    if (practice) sections.push(practice);

    const finalH = freezeSection(
      "final_hygiene",
      "Visual Field Guide — Final hygiene",
      visualFinalHygienePromptLines(),
    );
    if (finalH) sections.push(finalH);
  }

  const hardGates = freezeSection(
    "hard_gates",
    "HARD constraints (Gate — must satisfy)",
    structured.gates.map(
      (c) => `[${c.id}] ${c.promptLine}`,
    ),
  );
  if (hardGates) sections.push(hardGates);

  const weighted = freezeSection(
    "weighted_targets",
    "Weighted house targets",
    structured.weighted.map((c) => `[${c.id}] ${c.promptLine}`),
  );
  if (weighted) sections.push(weighted);

  // Always expose checklist strings when present (Admin/QC parity).
  const before = freezeSection("before_create", "Before create", beforeCreate);
  if (before) sections.push(before);
  const howTo = freezeSection("how_to_create", "How to create", howToCreate);
  if (howTo) sections.push(howTo);

  const exportSection = freezeSection(
    "export",
    "Export",
    formatExportLines(rule),
  );
  if (exportSection) sections.push(exportSection);

  const technical = freezeSection(
    "technical",
    "Technical",
    formatTechnicalLines(rule),
  );
  if (technical) sections.push(technical);

  if (includeUniversal && universal.length > 0) {
    const univ = freezeSection(
      "universal_gates",
      "Universal release gates",
      universal.map((g) => `[${g.id}] ${g.promptLine}`),
    );
    if (univ) sections.push(univ);
  }

  if (rule.productionNote?.trim()) {
    const note = freezeSection("production_note", "Production note", [
      rule.productionNote.trim(),
    ]);
    if (note) sections.push(note);
  }

  const frozenSections = Object.freeze(sections);
  const text = renderSectionsAsText(frozenSections);
  const contentHash = hashText(text);

  return Object.freeze({
    version: PRODUCTION_PROMPT_BLOCK_VERSION,
    productionRuleId: rule.id,
    edition: FORMAT_PRODUCTION_SPEC_EDITION,
    provenance: PRODUCTION_SPEC_STACK_PROVENANCE,
    authorityStatus: rule.status,
    sections: frozenSections,
    text,
    hardConstraintLines: Object.freeze([...hardLines]),
    softTargetLines: Object.freeze([...softLines]),
    contentHash,
  });
}

/**
 * Convenience: build block text only (empty string if somehow no sections).
 */
export function buildProductionPromptBlockText(
  input: BuildProductionPromptBlockInput,
): string {
  return buildProductionPromptBlock(input).text;
}
