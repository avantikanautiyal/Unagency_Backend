/**
 * Output comparison ports — interfaces only (M3.1).
 */

import type { Result } from "../../shared/result";

export interface ComparisonDelta {
  readonly path: string;
  readonly baseline?: unknown;
  readonly candidate?: unknown;
  readonly changed: boolean;
}

export interface ComparisonResult {
  readonly deltas: readonly ComparisonDelta[];
  readonly similarityScore: number;
}

export interface IOutputComparator {
  compare(
    baseline: Readonly<Record<string, unknown>>,
    candidate: Readonly<Record<string, unknown>>
  ): Result<ComparisonResult>;
}
