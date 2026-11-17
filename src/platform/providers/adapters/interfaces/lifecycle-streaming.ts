/**
 * Lifecycle + streaming ports.
 *
 * Purpose: Manage adapter lifecycle states and canonicalize streaming.
 * Responsibilities: state transitions; chunk normalization + stream lifecycle.
 * Usage: Injected into the registry and streaming-capable adapters.
 * Future Extension: Backpressure, resumable streams.
 */

import type { Result } from "../../../core/result";
import type { ProviderLifecycleState } from "../contracts/enums";
import type { ProviderAdapterId } from "../contracts/identifiers";
import type {
  ProviderLifecycleRecord,
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

