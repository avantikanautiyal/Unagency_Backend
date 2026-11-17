/**
 * SDK health, streaming, and execution result contracts.
 *
 * Purpose: Observability + streaming chunks + terminal result.
 * Responsibilities: Health state, stream events, execution outcome.
 * Usage: Produced by health monitor, streaming engine, SDK engine.
 * Future Extension: SLO fields.
 */

import type { SdkHealthState, SdkStreamEventKind, SdkVendor } from "./enums";
import type { SdkExecutionId } from "./identifiers";

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

