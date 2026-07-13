/**
 * Integration event publishers.
 */

import type { EventFactory } from "../../../events/implementations/event-factory";
import type { IEventBus } from "../../../events/interfaces/event-bus";
import type { ProviderIntegrationResult } from "../contracts/request-result";
import type { IIntegrationEventPublisher } from "../interfaces/engine";

export class NoopIntegrationEventPublisher implements IIntegrationEventPublisher {
  async publishResult(_result: ProviderIntegrationResult): Promise<void> {
    // Intentionally does nothing.
  }
}

export class EventBusIntegrationEventPublisher implements IIntegrationEventPublisher {
  constructor(
    private readonly eventBus: IEventBus,
    private readonly eventFactory: EventFactory
  ) {}

  async publishResult(result: ProviderIntegrationResult): Promise<void> {
    const envelope = this.eventFactory.create({
      type: `integration.${result.success ? "completed" : "failed"}`,
      payload: result,
      metadata: {
        sourceModule: "providers/integration",
        correlationId: result.requestId,
      },
    });
    await this.eventBus.publish(envelope);
  }
}
