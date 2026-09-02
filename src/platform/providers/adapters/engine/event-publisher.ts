/**
 * Adapter event publishers.
 *
 * Purpose: Optionally publish adapter registration/lifecycle events.
 * Responsibilities: map to envelopes; no-op fallback.
 * Usage: Injected into the registry; Noop is the default.
 * Future Extension: Per-stage pipeline events.
 */

import type { EventFactory } from "../../../events/implementations/event-factory";
import type { IEventBus } from "../../../events/interfaces/event-bus";
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

export class EventBusAdapterEventPublisher implements IAdapterEventPublisher {
  constructor(
    private readonly eventBus: IEventBus,
    private readonly eventFactory: EventFactory
  ) {}

  async publishRegistered(
    descriptor: ProviderAdapterDescriptor
  ): Promise<void> {
    const envelope = this.eventFactory.create({
      type: "adapter.registered",
      payload: descriptor,
      metadata: {
        sourceModule: "providers/adapters",
        correlationId: String(descriptor.metadata.adapterId),
      },
    });
    await this.eventBus.publish(envelope);
  }

  async publishLifecycle(
    adapterId: ProviderAdapterId,
    state: string
  ): Promise<void> {
    const envelope = this.eventFactory.create({
      type: `adapter.lifecycle.${state}`,
      payload: { adapterId, state },
      metadata: {
        sourceModule: "providers/adapters",
        correlationId: String(adapterId),
      },
    });
    await this.eventBus.publish(envelope);
  }
}
