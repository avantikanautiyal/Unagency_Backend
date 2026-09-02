/**
 * Lifecycle + streaming ports.
 *
 * Purpose: Manage adapter lifecycle states and canonicalize streaming.
 * Responsibilities: state transitions; chunk normalization + stream lifecycle.
 * Usage: Injected into the registry and streaming-capable adapters.
 * Future Extension: Backpressure, resumable streams.
 */

import type { Result } from "../../../core/result";
import type { ProviderWirePayload } from "../contracts/adapter-io";
import type { ProviderLifecycleState } from "../contracts/enums";
import type { ProviderAdapterId } from "../contracts/identifiers";
import type {
  ProviderLifecycleRecord,
  ProviderStreamChunk,
  ProviderStreamSession,
} from "../contracts/lifecycle-streaming";

export interface IAdapterLifecycleManager {
  register(adapterId: ProviderAdapterId): ProviderLifecycleRecord;
  transition(
    adapterId: ProviderAdapterId,
    to: ProviderLifecycleState,
    reason?: string
  ): Result<ProviderLifecycleRecord>;
  current(adapterId: ProviderAdapterId): ProviderLifecycleState | undefined;
  list(): readonly ProviderLifecycleRecord[];
  remove(adapterId: ProviderAdapterId): void;
}

export interface IStreamingAdapter {
  openStream(
    requestId: string,
    adapterId: ProviderAdapterId
  ): Result<ProviderStreamSession>;
  normalizeChunk(
    raw: ProviderWirePayload,
    session: ProviderStreamSession
  ): Result<ProviderStreamChunk>;
  heartbeat(session: ProviderStreamSession): Result<ProviderStreamChunk>;
  closeStream(session: ProviderStreamSession): Result<ProviderStreamSession>;
}
