/**
 * SDK request/response contracts.
 *
 * Purpose: The canonical boundary between adapters and SDK wrappers.
 * Responsibilities: Opaque payload in/out; no vendor SDK types.
 * Usage: Input/output of IProviderSdkClient.
 * Future Extension: Multipart payloads.
 *
 * `payload` is an opaque provider-shaped map (ProviderWirePayload).
 * SDK wrappers NEVER expose vendor SDK objects.
 */

import type { ProviderId } from "../../../shared/identifiers";
import type { ProviderWirePayload } from "../../adapters/contracts/adapter-io";
import type { SdkAuthentication } from "./authentication";
import type { SdkRetryPolicy, SdkTimeoutPolicy } from "./policies";
import type { SdkVendor } from "./enums";
import type { SdkError, SdkStatistics } from "./errors";

export interface SdkRequest {
  readonly requestId: string;
  readonly providerId: ProviderId;
  readonly vendor: SdkVendor;
  readonly operation: string;
  /** Opaque provider-shaped payload (no vendor SDK type). */
  readonly payload: ProviderWirePayload;
  readonly streaming: boolean;
  readonly authentication?: SdkAuthentication;
  readonly retryPolicy?: SdkRetryPolicy;
  readonly timeoutPolicy?: SdkTimeoutPolicy;
  readonly headers: Readonly<Record<string, string>>;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
}

export interface SdkResponse {
  readonly requestId: string;
  readonly providerId: ProviderId;
  readonly vendor: SdkVendor;
  readonly success: boolean;
  /** Opaque provider-shaped response payload. */
  readonly payload: ProviderWirePayload;
  readonly headers: Readonly<Record<string, string>>;
  readonly statusHint?: number;
  readonly streamed: boolean;
  readonly error?: SdkError;
  readonly statistics: SdkStatistics;
  readonly completedAt: string;
}
