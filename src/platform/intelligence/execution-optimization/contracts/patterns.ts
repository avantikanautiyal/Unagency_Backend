/**
 * Execution pattern and trend contracts.
 */

import type { TrendDirection } from "./enums";
import type { OptimizationDomain } from "./enums";

export interface ExecutionPattern {
  readonly id: string;
  readonly domain: OptimizationDomain;
  readonly description: string;
  readonly frequency: number;
  readonly impact: number;
  readonly detectedAt: string;
}

export interface ExecutionComparison {
  readonly metric: string;
  readonly before: number;
  readonly after: number;
  readonly delta: number;
  readonly deltaPercent: number;
}

export interface ExecutionTrend {
  readonly metric: string;
  readonly direction: TrendDirection;
  readonly values: readonly number[];
  readonly period: string;
}
