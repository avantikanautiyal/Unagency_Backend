import type { EventEnvelope } from "../contracts/event-envelope";
import type {
  EventHandler,
  IEventBus,
  Unsubscribe,
} from "../interfaces/event-bus";
import type { IntelligenceEventType } from "../types/event-types";

/**
 * In-process event bus for Milestone M0.
 * Replaceable with Kafka/BullMQ adapters in later milestones.
 */
export class InMemoryEventBus implements IEventBus {
  private readonly handlers = new Map<string, Set<EventHandler>>();
  private readonly globalHandlers = new Set<EventHandler>();

  async publish<TPayload>(event: EventEnvelope<TPayload>): Promise<void> {
    const typedHandlers = this.handlers.get(event.type);
    const invocations: Array<Promise<void> | void> = [];

    if (typedHandlers) {
      for (const handler of typedHandlers) {
        invocations.push(handler(event));
      }
    }

    for (const handler of this.globalHandlers) {
      invocations.push(handler(event));
    }

    await Promise.all(invocations);
  }

  subscribe<TPayload>(
    eventType: IntelligenceEventType,
    handler: EventHandler<TPayload>
  ): Unsubscribe {
    const key = eventType;
    let set = this.handlers.get(key);
    if (!set) {
      set = new Set();
      this.handlers.set(key, set);
    }
    set.add(handler as EventHandler);

    return () => {
      set?.delete(handler as EventHandler);
      if (set && set.size === 0) {
        this.handlers.delete(key);
      }
    };
  }

  subscribeAll(handler: EventHandler): Unsubscribe {
    this.globalHandlers.add(handler);
    return () => {
      this.globalHandlers.delete(handler);
    };
  }
}
