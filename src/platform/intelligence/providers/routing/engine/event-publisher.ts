/**
 * Routing event publishers.
 */

import type { EventFactory } from "../../../events/implementations/event-factory";
import type { IEventBus } from "../../../events/interfaces/event-bus";
import type { RoutingDecision } from "../contracts/plan";
import type { IRoutingEventPublisher } from "../interfaces/routing";

export class NoopRoutingEventPublisher implements IRoutingEventPublisher {
  async publishDecision(_decision: RoutingDecision): Promise<void> {
    // Intentionally does nothing.
  }
}

export class EventBusRoutingEventPublisher implements IRoutingEventPublisher {
  constructor(
    private readonly eventBus: IEventBus,
    private readonly eventFactory: EventFactory
  ) {}

  async publishDecision(decision: RoutingDecision): Promise<void> {
    const envelope = this.eventFactory.create({
      type: `routing.decision.completed`,
      payload: decision,
      metadata: {
        sourceModule: "providers/routing",
        correlationId: decision.plan.requestId,
      },
    });
    await this.eventBus.publish(envelope);
  }
}
