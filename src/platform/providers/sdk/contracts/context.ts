/**
 * SDK execution context + metadata contracts.
 *
 * Purpose: Immutable context threaded through SDK execution.
 * Responsibilities: Correlate an SDK operation; carry non-secret attributes.
 * Usage: Created by the engine; passed to clients and subsystems.
 * Future Extension: Trace/span propagation.
 */

import type { ProviderId } from "../../../core/identifiers";
import type { SdkClientId, SdkExecutionId } from "./identifiers";
import type { SdkVendor } from "./enums";

export interface SdkMetadata {
  readonly attempt: number;
  readonly vendor: SdkVendor;
  readonly region?: string;
  readonly tags: Readonly<Record<string, string>>;
}

export interface SdkExecutionContext {
  readonly executionId: SdkExecutionId;
  readonly requestId: string;
  readonly providerId: ProviderId;
  readonly vendor: SdkVendor;
  readonly clientId?: SdkClientId;
  readonly attributes: Readonly<Record<string, unknown>>;
  readonly startedAt: string;
}
