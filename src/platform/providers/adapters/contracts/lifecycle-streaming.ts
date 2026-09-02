/**
 * Lifecycle, streaming, diagnostics report contracts.
 *
 * Purpose: Records for adapter lifecycle, canonical stream chunks, and reports.
 * Responsibilities: Immutable shapes for lifecycle/health/streaming/diagnostics.
 * Usage: Produced by lifecycle manager, streaming adapter, diagnostics.
 * Future Extension: SLO metrics, error-rate summaries.
 */

import type { ProviderId } from "../../../core/identifiers";
import type { ProviderDiagnostic } from "./diagnostics";
import type {
  ProviderLifecycleState,
  StreamEventKind,
} from "./enums";
import type { ProviderAdapterId } from "./identifiers";

export interface ProviderLifecycleRecord {
  readonly adapterId: ProviderAdapterId;
  readonly state: ProviderLifecycleState;
  readonly since: string;
  readonly reason?: string;
}

/**
 * Canonical streaming chunk (provider-independent).
 */
export interface ProviderStreamChunk {
  readonly sessionId: string;
  readonly requestId: string;
  readonly sequence: number;
  readonly kind: StreamEventKind;
  /** Canonical incremental content (empty for heartbeat/end). */
  readonly delta: Readonly<Record<string, unknown>>;
  readonly done: boolean;
  readonly receivedAt: string;
}

export interface ProviderStreamSession {
  readonly sessionId: string;
  readonly requestId: string;
  readonly adapterId: ProviderAdapterId;
  readonly chunks: readonly ProviderStreamChunk[];
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly active: boolean;
}

export interface ProviderHealthSummary {
  readonly adapterId: ProviderAdapterId;
  readonly providerId: ProviderId;
  readonly state: ProviderLifecycleState;
  readonly healthy: boolean;
  readonly checkedAt: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface ProviderCompatibilityReport {
  readonly adapterId: ProviderAdapterId;
  readonly providerId: ProviderId;
  readonly compatible: boolean;
  readonly missingCapabilities: readonly string[];
  readonly unsupportedFeatures: readonly string[];
  readonly issues: readonly ProviderDiagnostic[];
}
