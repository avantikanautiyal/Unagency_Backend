/**
 * Event bus ports. Implementations are replaceable (in-memory → BullMQ/Kafka).
 */

import type { EventEnvelope } from "../contracts/event-envelope";
import type { IntelligenceEventType } from "../types/event-types";

export type EventHandler<TPayload = unknown> = (
  event: EventEnvelope<TPayload>
) => Promise<void> | void;

export type Unsubscribe = () => void;

export interface IEventPublisher {
  publish<TPayload>(event: EventEnvelope<TPayload>): Promise<void>;
}

export interface IEventSubscriber {
  subscribe<TPayload>(
    eventType: IntelligenceEventType,
    handler: EventHandler<TPayload>
  ): Unsubscribe;
}

export interface IEventBus extends IEventPublisher, IEventSubscriber {
  /**
   * Subscribe to all events (useful for audit/telemetry bridges).
   */
  subscribeAll(handler: EventHandler): Unsubscribe;
}
