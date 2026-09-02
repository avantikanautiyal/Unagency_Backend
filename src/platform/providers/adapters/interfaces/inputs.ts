/**
 * Shared engine input contracts.
 *
 * Purpose: Inputs to the adapter engine's prepare/normalize steps.
 * Responsibilities: Bundle a NegotiatedExecution + canonical payload.
 * Usage: Passed to IProviderAdapterEngine and IRequestTranslator.
 * Future Extension: Multi-part inputs, tool definitions.
 */

import type { NegotiatedExecution } from "../../negotiation/contracts/negotiated-execution";
import type { ProviderWirePayload } from "../contracts/adapter-io";
import type { ProviderAdapterRequest } from "../contracts/adapter-io";
import type { ProviderModality } from "../contracts/enums";
import type { ProviderAdapterId } from "../contracts/identifiers";

export interface PrepareAdapterExecutionInput {
  readonly negotiated: NegotiatedExecution;
  /** Canonical input payload (messages/prompt/media refs). */
  readonly input: Readonly<Record<string, unknown>>;
  readonly parameters?: Readonly<Record<string, unknown>>;
  readonly modality?: ProviderModality;
  readonly requestId?: string;
  readonly timeoutMs?: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface NormalizeAdapterResponseInput {
  readonly adapterId: ProviderAdapterId;
  readonly request: ProviderAdapterRequest;
  /** Opaque provider-shaped payload (no vendor SDK type). */
  readonly raw: ProviderWirePayload;
  readonly latencyMs?: number;
}
