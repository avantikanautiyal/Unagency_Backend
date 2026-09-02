/**
 * Provider runtime event publisher port.
 *
 * Purpose: Publish lifecycle events without coupling to a specific bus.
 * Responsibilities: Publish (type, event) pairs.
 * Usage: The runtime publishes; a no-op or bus-backed implementation is injected.
 * Future Extension: Batching and event filtering.
 */

import type {
  ProviderExecutionEvent,
  ProviderExecutionEventType,
} from "../contracts/provider-execution-event";

export interface IProviderRuntimeEventPublisher {
  publish(
    type: ProviderExecutionEventType,
    event: ProviderExecutionEvent
  ): Promise<void>;
}
