/**
 * Provider runtime event publishers.
 *
 * Purpose: Publish lifecycle events, optionally over the platform IEventBus.
 * Responsibilities: Map runtime events to envelopes; no-op fallback.
 * Usage: Injected into the runtime; NoopPublisher is the default.
 * Future Extension: Batching and filtering.
 */

import type { EventFactory } from "../../../events/implementations/event-factory";
import type { IEventBus } from "../../../events/interfaces/event-bus";
import type {
  ProviderExecutionEvent,
  ProviderExecutionEventType,
} from "../contracts/provider-execution-event";
import type { IProviderRuntimeEventPublisher } from "../interfaces/event-publisher";

export class NoopProviderRuntimeEventPublisher
  implements IProviderRuntimeEventPublisher
{
  async publish(
    _type: ProviderExecutionEventType,
    _event: ProviderExecutionEvent
  ): Promise<void> {
    // Intentionally does nothing.
  }
}

export class EventBusProviderRuntimeEventPublisher
  implements IProviderRuntimeEventPublisher
{
  constructor(
    private readonly eventBus: IEventBus,
    private readonly eventFactory: EventFactory
  ) {}

  async publish(
    type: ProviderExecutionEventType,
    event: ProviderExecutionEvent
  ): Promise<void> {
    const envelope = this.eventFactory.create({
      type,
      payload: event,
      metadata: {
        sourceModule: "providers/runtime",
        correlationId: event.requestId,
      },
    });
    await this.eventBus.publish(envelope);
  }
}
