/**
 * Publishes execution lifecycle events via IEventBus.
 */

import type { EventFactory } from "../../events/implementations/event-factory";
import type { IEventBus } from "../../events/interfaces/event-bus";
import type { ExecutionEventPayload, ExecutionEventType } from "./execution-event-types";

export interface IExecutionEventPublisher {
  publish(
    type: ExecutionEventType,
    payload: ExecutionEventPayload
  ): Promise<void>;
}

export class ExecutionEventPublisher implements IExecutionEventPublisher {
  constructor(
    private readonly eventBus: IEventBus,
    private readonly eventFactory: EventFactory
  ) {}

  async publish(
    type: ExecutionEventType,
    payload: ExecutionEventPayload
  ): Promise<void> {
    const event = this.eventFactory.create({
      type,
      payload,
      metadata: {
        sourceModule: "execution-runtime",
        correlationId: payload.executionId,
      },
    });
    await this.eventBus.publish(event);
  }
}
