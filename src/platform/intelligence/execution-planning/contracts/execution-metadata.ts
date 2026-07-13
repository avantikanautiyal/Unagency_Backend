/**
 * Execution plan metadata envelope.
 */

import type { CapabilityId, ProviderId } from "../../shared/identifiers";
import type { ExecutionPriority } from "./execution-priority";
import type { ExecutionStrategy } from "./execution-strategy";

export interface ExecutionCostEstimate {
  readonly estimatedCost?: number;
  readonly estimatedTokens?: number;
  readonly currency?: string;
  readonly confidence?: number;
}

export interface ExecutionMetadata {
  readonly planId: string;
  readonly capabilityId: CapabilityId;
  readonly capabilityVersion?: string;
  readonly primaryProviderId: ProviderId;
  readonly fallbackProviderIds: readonly ProviderId[];
  readonly strategy: ExecutionStrategy;
  readonly priority: ExecutionPriority;
  readonly costEstimate: ExecutionCostEstimate;
  readonly createdAt: string;
  readonly correlationId?: string;
  readonly attributes?: Readonly<Record<string, unknown>>;
}
