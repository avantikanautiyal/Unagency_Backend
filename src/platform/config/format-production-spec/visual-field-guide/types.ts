/**
 * Visual Field Guide — machine contracts (Edition 1.0 / 05 Sep 2026).
 * Companion to Format Spec + Service & Hygiene Reference.
 */

import type { ProductionHygieneCheck } from "../types";

/** House master canvas presets from Field Guide FORMAT LOGIC. */
export type VisualFormatMasterId =
  | "square"
  | "portrait"
  | "vertical"
  | "landscape_video";

export type VisualFormatMaster = {
  readonly id: VisualFormatMasterId;
  readonly width: number;
  readonly height: number;
  readonly unit: "px";
  readonly label: string;
  readonly promptLine: string;
};

/** Identity / layout system lines injected into every visual create. */
export type VisualIdentitySystemPack = {
  readonly id: "identity_system";
  readonly title: string;
  readonly lines: readonly string[];
};

export type VisualLayoutHygienePack = {
  readonly id: "layout_hygiene";
  readonly title: string;
  readonly lines: readonly string[];
};

export type VisualPlacementHygienePack = {
  readonly id: "placement_hygiene";
  readonly title: string;
  readonly lines: readonly string[];
};

export type VisualFormatLogicPack = {
  readonly id: "format_logic";
  readonly title: string;
  readonly lines: readonly string[];
  readonly masters: readonly VisualFormatMaster[];
};

/** Per-service visual recipe from Field Guide SERVICE 01–15 pages. */
export type ServiceVisualRecipe = {
  /** Runtime service slug (social, website, branding, …). */
  readonly service: string;
  /** Field Guide service number 01–15. */
  readonly serviceNumber: string;
  readonly title: string;
  /** One-line mantra from the guide. */
  readonly mantra: string;
  /** Composition / deliverable pattern for providers. */
  readonly compositionPrompt: string;
  readonly coverage: readonly string[];
  readonly checkFirst: readonly ProductionHygieneCheck[];
  readonly checkLast: readonly ProductionHygieneCheck[];
};

export type GoodPracticeRow = {
  readonly id: string;
  readonly keep: string;
  readonly avoid: string;
  readonly confirm: string;
  readonly promptLine: string;
};

export type ResolvedVisualFieldGuide = {
  readonly edition: string;
  readonly provenance: string;
  readonly identity: VisualIdentitySystemPack;
  readonly layout: VisualLayoutHygienePack;
  readonly placement: VisualPlacementHygienePack;
  readonly formatLogic: VisualFormatLogicPack;
  readonly recipe?: ServiceVisualRecipe;
  readonly goodPractice: readonly GoodPracticeRow[];
  /** Flattened Gate checks from recipe checkFirst/checkLast for evidence. */
  readonly recipeGateChecks: readonly ProductionHygieneCheck[];
};
