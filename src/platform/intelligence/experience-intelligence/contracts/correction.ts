/**
 * Correction strategy model — structured intelligence only, never modifies prompts.
 */

import type { CorrectionKind } from "./enums";

export interface CorrectionStrategy {
  readonly strategyId: string;
  readonly kind: CorrectionKind;
  readonly instruction: string;
  readonly rationale: string;
  readonly priority: "high" | "medium" | "low";
  readonly advisoryOnly: true;
}
