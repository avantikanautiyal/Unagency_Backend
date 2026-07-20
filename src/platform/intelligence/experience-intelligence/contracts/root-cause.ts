/**
 * Root cause model.
 */

import type { RootCauseKind } from "./enums";

export interface RootCause {
  readonly causeId: string;
  readonly kind: RootCauseKind;
  readonly description: string;
  readonly evidence: readonly string[];
  readonly confidence: number;
}
