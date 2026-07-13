/**
 * Factory for ExecutionRuntime.
 *
 * Purpose: Wire runtime with in-memory store and event publisher.
 * Responsibilities: Constructor injection of ports.
 * Usage: Pass IEventBus + EventFactory from events module.
 * Future Extension: Durable store adapters.
 */

import type { EventFactory } from "../../events/implementations/event-factory";
import type { IEventBus } from "../../events/interfaces/event-bus";
import { ExecutionEventPublisher } from "../events/execution-event-publisher";
import type { IExecutionRuntime } from "../interfaces/execution-runtime";
import { ExecutionRuntime } from "../runtime/execution-runtime";
import { InMemoryExecutionStore } from "../store/execution-store";

export interface CreateExecutionRuntimeOptions {
  readonly eventBus: IEventBus;
  readonly eventFactory: EventFactory;
  readonly nowIso?: () => string;
}

export function createExecutionRuntime(
  options: CreateExecutionRuntimeOptions
): IExecutionRuntime {
  return new ExecutionRuntime({
    store: new InMemoryExecutionStore(),
    events: new ExecutionEventPublisher(
      options.eventBus,
      options.eventFactory
    ),
    nowIso: options.nowIso,
  });
}
