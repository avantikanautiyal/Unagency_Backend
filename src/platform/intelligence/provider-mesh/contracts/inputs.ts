/**
 * Provider Mesh inputs — reuse frozen contracts where possible.
 */

import type { ProviderExecutionResult } from "../../providers/runtime/contracts/provider-execution-response";
import type { ProviderObservabilityReport } from "../../execution-optimization/contracts/inputs";
import type { ProviderHealthSummary } from "../../providers/adapters/contracts/lifecycle-streaming";
import type { CertificationStatus } from "../../provider-certification/contracts/enums";
import type { MeshEventKind } from "./enums";

export interface MeshMetricHints {
  readonly latencyMs?: number;
  readonly p95LatencyMs?: number;
  readonly errorRate?: number;
  readonly retryRate?: number;
  readonly timeoutRate?: number;
  readonly availability?: number;
  readonly concurrentExecutions?: number;
  readonly capacityUtilization?: number;
  readonly cost?: number;
  readonly qualityScore?: number;
  readonly successRate?: number;
}

export interface ProviderMeshEvent {
  readonly eventId: string;
  readonly providerId: string;
  readonly kind: MeshEventKind;
  readonly observedAt: string;
  readonly execution?: ProviderExecutionResult;
  readonly observability?: ProviderObservabilityReport;
  readonly health?: ProviderHealthSummary;
  readonly certificationStatus?: CertificationStatus;
  readonly metrics?: MeshMetricHints;
  readonly rateLimited?: boolean;
  readonly maintenance?: boolean;
  readonly deprecated?: boolean;
  readonly experimental?: boolean;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface ProviderMeshRequest {
  readonly requestId: string;
  readonly events: readonly ProviderMeshEvent[];
  readonly providerIds?: readonly string[];
  readonly metadata?: Readonly<Record<string, unknown>>;
}
