/**
 * Transport event publishers.
 *
 * Purpose: Optionally publish transport results on the platform bus.
 * Responsibilities: map results to envelopes; no-op fallback.
 * Usage: Injected into the engine; Noop is the default.
 * Future Extension: Per-stage transport events.
 */

import type { EventFactory } from "../../../events/implementations/event-factory";
import type { IEventBus } from "../../../events/interfaces/event-bus";
import type { TransportResult } from "../contracts/health-result";
import type { ITransportEventPublisher } from "../interfaces/engine";

export class NoopTransportEventPublisher implements ITransportEventPublisher {
  async publishResult(_result: TransportResult): Promise<void> {
    // Intentionally does nothing.
  }
}

export class EventBusTransportEventPublisher implements ITransportEventPublisher {
  constructor(
    private readonly eventBus: IEventBus,
    private readonly eventFactory: EventFactory
  ) {}

  async publishResult(result: TransportResult): Promise<void> {
    const envelope = this.eventFactory.create({
      type: `transport.${result.success ? "completed" : "failed"}`,
      payload: result,
      metadata: {
        sourceModule: "providers/transport",
        correlationId: result.requestId,
      },
    });
    await this.eventBus.publish(envelope);
  }
}
