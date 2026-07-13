/**
 * Negotiation event publishers.
 *
 * Purpose: Optionally publish negotiation results on the platform bus.
 * Responsibilities: map results to envelopes; no-op fallback.
 * Usage: Injected into the engine; Noop is the default.
 * Future Extension: Emit per-stage progress events.
 */

import type { EventFactory } from "../../../events/implementations/event-factory";
import type { IEventBus } from "../../../events/interfaces/event-bus";
import type { NegotiationResult } from "../contracts/negotiation-result";
import type { INegotiationEventPublisher } from "../interfaces/negotiation-engine";

export class NoopNegotiationEventPublisher
  implements INegotiationEventPublisher
{
  async publish(_result: NegotiationResult): Promise<void> {
    // Intentionally does nothing.
  }
}

export class EventBusNegotiationEventPublisher
  implements INegotiationEventPublisher
{
  constructor(
    private readonly eventBus: IEventBus,
    private readonly eventFactory: EventFactory
  ) {}

  async publish(result: NegotiationResult): Promise<void> {
    const envelope = this.eventFactory.create({
      type: `negotiation.${result.decision}`,
      payload: result,
      metadata: {
        sourceModule: "providers/negotiation",
        correlationId: result.negotiationId,
      },
    });
    await this.eventBus.publish(envelope);
  }
}
