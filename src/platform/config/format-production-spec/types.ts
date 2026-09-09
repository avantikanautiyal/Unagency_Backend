/**
 * Types for the Format & Production Specification catalog.
 * Authority stack: law/safety → booked/vendor → brief/identity → house defaults (D).
 *
 * Phase 0 adds structured hygiene + prompt-block contracts from the
 * Service & Hygiene Reference without changing runtime wiring.
 */

import type { FORMAT_PRODUCTION_SPEC_EDITION } from "./edition";

/** D = house default, V = verified cited fact, R = confirm first, H = do not produce as approved. */
export type AuthorityStatus = "D" | "V" | "R" | "H";

export type ColourSpace =
  | "sRGB"
  | "Rec.709"
  | "CMYK"
  | "screen-rgb"
  | "vendor"
  | "agreed-print";

export type CanvasUnit = "px" | "mm" | "in";

export type ProductionCanvas = {
  readonly width: number;
  readonly height: number;
  readonly unit: CanvasUnit;
};

export type ProductionExport = {
  readonly formats: readonly string[];
  readonly notes?: string;
};

/**
 * Gate = must pass for approved release (score cannot override).
 * Weighted = house creative-quality target; justified exceptions allowed.
 */
export type HygieneWeight = "gate" | "weighted";

/**
 * How Phase 3+ compliance should evaluate the check.
 * Aligned with deliverable-compliance measurement methods.
 */
export type HygieneEvaluationMethod =
  | "MEASURED"
  | "HEURISTIC"
  | "MODEL_JUDGED"
  | "NOT_AUTOMATED";

/**
 * Structured hygiene check from the Service & Hygiene Reference.
 * String checklists (`beforeCreateChecks` / `howToCreate`) remain for Admin QC.
 */
export type ProductionHygieneCheck = {
  /** Stable id within the rule or universal catalog (e.g. "safe-zones"). */
  readonly id: string;
  readonly weight: HygieneWeight;
  readonly evaluationMethod: HygieneEvaluationMethod;
  /** Human / Admin pass definition. */
  readonly passDefinition: string;
  /** Concise provider-facing instruction line. */
  readonly promptLine: string;
};

/**
 * Universal release-gate ids from Hygiene Reference HYGIENE 01.
 * Rules may declare a subset via `universalGateIds`; omit = all apply.
 */
export type UniversalGateId =
  | "brief"
  | "identity"
  | "copy"
  | "rights"
  | "technical"
  | "readability"
  | "destination"
  | "source_package"
  | "approval";

export type ProductionRule = {
  readonly id: string;
  readonly edition: typeof FORMAT_PRODUCTION_SPEC_EDITION;
  readonly service: string;
  readonly subtype?: string;
  readonly platform?: string;
  /** Spec placement label (e.g. feed.portrait, ad.single-image.landscape). */
  readonly placement: string;
  readonly status: AuthorityStatus;
  /** Citation from Spec when status is V (e.g. "[S3]"). */
  readonly sourceRef?: string;
  readonly canvas?: ProductionCanvas;
  readonly colour?: ColourSpace;
  readonly export?: ProductionExport;
  readonly productionNote?: string;
  /** Spec "BEFORE PAGE CREATION" / hygiene reminders for QC. */
  readonly beforeCreateChecks?: readonly string[];
  /** Spec "HOW TO CREATE THE PAGE" production reminders for QC. */
  readonly howToCreate?: readonly string[];
  /**
   * Structured Gate / Weighted hygiene (Phase 0+).
   * When present, prompt blocks and future compliance prefer these over
   * free-text checklist strings for HARD / soft target lines.
   */
  readonly hygieneChecks?: readonly ProductionHygieneCheck[];
  /**
   * Which universal release gates apply to this rule.
   * Omit or empty → all universal gates apply.
   */
  readonly universalGateIds?: readonly UniversalGateId[];
  readonly print?: {
    readonly bleedMm?: number;
    readonly effectivePpi?: number;
  };
  /**
   * When true, do not book/release as an approved output until a confirmed
   * override replaces this rule (R/H, and optionally D when product chooses).
   */
  readonly blocksReleaseIfUnconfirmed: boolean;
};

export type ResolveProductionRuleInput = {
  readonly service?: string;
  readonly subtype?: string;
  readonly platform?: string;
  /** Social/product format id (e.g. feed-post, reels) or Spec placement id. */
  readonly formatId?: string;
  /** Explicit Spec placement key (e.g. instagram.feed.portrait). */
  readonly placementId?: string;
};

export type ResolvedProductionRule = {
  readonly rule: ProductionRule;
  /** How the rule was matched. */
  readonly matchedBy:
    | "placementId"
    | "formatMapping"
    | "platformPlacement"
    | "serviceDefault";
};
