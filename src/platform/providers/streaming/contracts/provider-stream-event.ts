/**
 * M9.5O — Canonical provider-neutral stream events.
 * Vendor chunk schemas must never escape provider leaves.
 */

import type { NormalizedUsage } from "../../../cost/contracts/normalized-usage";

export type ProviderStreamEventType =
  | "stream.started"
  | "content.delta"
  | "reasoning.delta"
  | "tool_call.started"
  | "tool_call.arguments.delta"
  | "tool_call.completed"
  | "audio.chunk"
  | "usage.delta"
  | "usage.final"
  | "stream.completed"
  | "stream.failed"
  | "stream.cancelled"
  | "tool.approval_required"
  | "lifecycle";

export interface ProviderStreamToolCall {
  readonly id: string;
  readonly name?: string;
  readonly argumentsDelta?: string;
}

export interface ProviderStreamAudio {
  /** Bounded chunk — never full audio in diagnostics. */
  readonly byteLength: number;
  readonly mimeType?: string;
  /** Optional in-process bytes for assembly/storage tee; omit from API JSON. */
  readonly bytes?: Uint8Array;
}

/**
 * Semantic events that commit the stream once externally emitted.
 */
export const SEMANTIC_STREAM_EVENT_TYPES: ReadonlySet<ProviderStreamEventType> =
  new Set([
    "content.delta",
    "reasoning.delta",
    "tool_call.started",
    "tool_call.arguments.delta",
    "tool_call.completed",
    "audio.chunk",
  ]);

export interface ProviderStreamEvent {
  readonly type: ProviderStreamEventType;
  readonly executionId?: string;
  readonly attemptId?: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly capabilityId: string;
  /** Monotonic within a provider attempt. */
  readonly sequence: number;
  readonly contentDelta?: string;
  readonly reasoningDelta?: string;
  readonly toolCall?: ProviderStreamToolCall;
  readonly audio?: ProviderStreamAudio;
  readonly usage?: NormalizedUsage | null;
  readonly finishReason?: string;
  readonly errorCode?: string;
  readonly errorMessage?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly at: string;
}

export type StreamTerminationReason =
  | "completed"
  | "provider_failed"
  | "client_disconnected"
  | "user_cancelled"
  | "provider_cancelled"
  | "server_shutdown"
  | "timeout"
  | "idle_timeout"
  | "max_duration"
  | "streaming_not_supported"
  | "circuit_open"
  | "approval_required";

export type StreamUsageStatus = "unknown" | "partial" | "final";
