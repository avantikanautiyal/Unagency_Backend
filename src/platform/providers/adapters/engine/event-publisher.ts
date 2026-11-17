/**
 * Adapter event publishers.
 *
 * Purpose: Optionally publish adapter registration/lifecycle events.
 * Responsibilities: map to envelopes; no-op fallback.
 * Usage: Injected into the registry; Noop is the default.
 * Future Extension: Per-stage pipeline events.
 */

import type { ProviderAdapterDescriptor } from "../contracts/adapter-descriptor";
import type { ProviderAdapterId } from "../contracts/identifiers";
import type { IAdapterEventPublisher } from "../interfaces/engine-registry";

export class NoopAdapterEventPublisher implements IAdapterEventPublisher {
  async publishRegistered(_descriptor: ProviderAdapterDescriptor): Promise<void> {
    // Intentionally does nothing.
  }
  async publishLifecycle(_adapterId: ProviderAdapterId, _state: string): Promise<void> {
    // Intentionally does nothing.
  }
}

