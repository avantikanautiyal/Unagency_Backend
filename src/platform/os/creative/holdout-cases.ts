/**
 * Track A Phase A0 — fixed holdout jobs for BASELINE_THIN_v1.
 * Used by run-holdout-baseline script and contract tests.
 */

import type { BrandMemorySlotKey } from "./brand-memory-slots";

export type HoldoutContinuityExpect =
  | "N/A"
  | "ASK"
  | "bind_logo"
  | "bind_colors"
  | "bind_voice"
  | "bind_productHero"
  | "bind_brand_kit"
  | "conflict_surface"
  | "thin_quality";

export type HoldoutBrandFixture =
  | "northstar_new"
  | "northstar_with_logo"
  | "northstar_full"
  | "northstar_no_logo"
  | "northstar_navy";

export interface HoldoutCaseV0 {
  readonly id: string;
  readonly brief: string;
  readonly service: string;
  readonly brandFixture: HoldoutBrandFixture;
  readonly continuityExpect: HoldoutContinuityExpect;
  /** Minimum Track A phase before continuity expect is testable offline. */
  readonly phaseRequired: "A0" | "A1" | "A2" | "A6";
  readonly notes?: string;
}

/** Authoritative holdout set — keep in sync with docs/BASELINE_THIN_v1.md */
export const HOLDOUT_CASES_V0: readonly HoldoutCaseV0[] = Object.freeze([
  {
    id: "H01",
    brief: "Generate a logo for Northstar Coffee, warm tones, not too fancy",
    service: "branding",
    brandFixture: "northstar_new",
    continuityExpect: "N/A",
    phaseRequired: "A0",
    notes: "Approve later → seeds memory for H02+",
  },
  {
    id: "H02",
    brief: "Instagram feed post: Diwali sale 20%, use our logo",
    service: "social",
    brandFixture: "northstar_with_logo",
    continuityExpect: "bind_logo",
    phaseRequired: "A2",
  },
  {
    id: "H03",
    brief: "Paid ad square matching our brand colors",
    service: "ads",
    brandFixture: "northstar_full",
    continuityExpect: "bind_colors",
    phaseRequired: "A2",
  },
  {
    id: "H04",
    brief: "Caption for launch email in our voice",
    service: "copy",
    brandFixture: "northstar_full",
    continuityExpect: "bind_voice",
    phaseRequired: "A2",
  },
  {
    id: "H05",
    brief: "Lifestyle image using our product hero shot",
    service: "photography",
    brandFixture: "northstar_full",
    continuityExpect: "bind_productHero",
    phaseRequired: "A2",
  },
  {
    id: "H06",
    brief: "Social post: use our logo",
    service: "social",
    brandFixture: "northstar_no_logo",
    continuityExpect: "ASK",
    phaseRequired: "A2",
  },
  {
    id: "H07",
    brief: "Make everything bright red (brand navy canonical)",
    service: "social",
    brandFixture: "northstar_navy",
    continuityExpect: "conflict_surface",
    phaseRequired: "A6",
  },
  {
    id: "H08",
    brief: "",
    service: "any",
    brandFixture: "northstar_new",
    continuityExpect: "N/A",
    phaseRequired: "A0",
    notes: "Opt-in brief assist only — never auto-compile",
  },
  {
    id: "H09",
    brief: "UAE mein cold coffee launch students ke liye next month",
    service: "launch/social",
    brandFixture: "northstar_new",
    continuityExpect: "thin_quality",
    phaseRequired: "A0",
  },
  {
    id: "H10",
    brief: "Website header for Northstar",
    service: "website",
    brandFixture: "northstar_full",
    continuityExpect: "bind_brand_kit",
    phaseRequired: "A2",
  },
]);

export function getHoldoutCase(id: string): HoldoutCaseV0 | undefined {
  return HOLDOUT_CASES_V0.find((c) => c.id === id);
}

/** Slots seeded per fixture for offline bind simulation. */
export function holdoutFixtureSlots(
  fixture: HoldoutBrandFixture
): readonly BrandMemorySlotKey[] {
  switch (fixture) {
    case "northstar_new":
      return [];
    case "northstar_no_logo":
      return ["colors", "voice"];
    case "northstar_with_logo":
      return ["logo"];
    case "northstar_navy":
      return ["logo", "colors"];
    case "northstar_full":
      return ["logo", "colors", "voice", "productHero", "type"];
    default:
      return [];
  }
}
