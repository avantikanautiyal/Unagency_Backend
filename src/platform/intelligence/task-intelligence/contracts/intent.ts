/**
 * Intent analysis contracts.
 */

import type { IntentKind } from "./enums";

export interface IntentScore {
  readonly intent: IntentKind;
  readonly score: number;
  readonly confidence: number;
  readonly rationale: string;
}

export interface IntentProfile {
  readonly primaryIntent: IntentKind;
  readonly secondaryIntent?: IntentKind;
  readonly scores: readonly IntentScore[];
  readonly summary: string;
  readonly confidence: number;
}
