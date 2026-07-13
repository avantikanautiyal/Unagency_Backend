/**
 * Routing strategy, policy, and constraint contracts.
 */

import type { RoutingStrategyKind } from "./enums";

export interface RoutingStrategy {
  readonly kind: RoutingStrategyKind;
  readonly weights?: Readonly<Record<string, number>>;
  readonly stickyKey?: string;
  readonly seed?: number;
}

export interface RoutingPolicy {
  readonly policyId: string;
  readonly name: string;
  readonly strategy: RoutingStrategy;
  readonly maxCandidates?: number;
  readonly requireHealthy?: boolean;
  readonly allowExperimental?: boolean;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface RoutingConstraint {
  readonly code: string;
  readonly message: string;
  readonly required?: boolean;
  readonly region?: string;
  readonly maxLatencyMs?: number;
  readonly maxCost?: number;
  readonly minQuality?: number;
  readonly complianceTags?: readonly string[];
}
