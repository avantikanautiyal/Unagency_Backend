/**
 * SDK health, streaming, and execution result contracts.
 *
 * Purpose: Observability + streaming chunks + terminal result.
 * Responsibilities: Health state, stream events, execution outcome.
 * Usage: Produced by health monitor, streaming engine, SDK engine.
 * Future Extension: SLO fields.
 */

import type { ProviderId } from "../../../core/identifiers";
import type { SdkHealthState, SdkStreamEventKind, SdkVendor } from "./enums";
import type { SdkClientId, SdkExecutionId } from "./identifiers";
import type { SdkResponse } from "./request-response";
import type { SdkError, SdkStatistics } from "./errors";

export interface SdkHealth {
  readonly vendor: SdkVendor;
  readonly state: SdkHealthState;
  readonly configured: boolean;
  readonly registered: boolean;
  readonly checkedAt: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface SdkStreamingChunk {
  readonly executionId: SdkExecutionId;
  readonly requestId: string;
  readonly sequence: number;
  readonly kind: SdkStreamEventKind;
  readonly data: Readonly<Record<string, unknown>>;
  readonly done: boolean;
  readonly receivedAt: string;
}

export interface SdkExecutionResult {
  readonly executionId: SdkExecutionId;
  readonly requestId: string;
  readonly providerId: ProviderId;
  readonly vendor: SdkVendor;
  readonly clientId: SdkClientId;
  readonly success: boolean;
  readonly response?: SdkResponse;
  readonly error?: SdkError;
  readonly statistics: SdkStatistics;
  readonly completedAt: string;
}
