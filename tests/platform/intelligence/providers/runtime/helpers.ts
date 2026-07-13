import { createProviderRuntime } from "../../../../../src/platform/intelligence/providers/runtime/factories/create-provider-runtime";
import type { CreateProviderRuntimeOptions } from "../../../../../src/platform/intelligence/providers/runtime/factories/create-provider-runtime";
import type { IProviderRuntimeEventPublisher } from "../../../../../src/platform/intelligence/providers/runtime/interfaces/event-publisher";
import type {
  ProviderExecutionEvent,
  ProviderExecutionEventType,
} from "../../../../../src/platform/intelligence/providers/runtime/contracts/provider-execution-event";
import { ControllableDispatcher } from "../../../../../src/platform/intelligence/providers/runtime/testing";
import type { IProviderRuntime } from "../../../../../src/platform/intelligence/providers/runtime/interfaces/provider-runtime";

export interface RecordedEvent {
  readonly type: ProviderExecutionEventType;
  readonly event: ProviderExecutionEvent;
}

export class RecordingEventPublisher implements IProviderRuntimeEventPublisher {
  readonly events: RecordedEvent[] = [];
  async publish(
    type: ProviderExecutionEventType,
    event: ProviderExecutionEvent
  ): Promise<void> {
    this.events.push({ type, event });
  }
  types(): ProviderExecutionEventType[] {
    return this.events.map((e) => e.type);
  }
}

export interface RuntimeFixture {
  readonly runtime: IProviderRuntime;
  readonly dispatcher: ControllableDispatcher;
  readonly events: RecordingEventPublisher;
}

export function createRuntimeFixture(
  options: Partial<CreateProviderRuntimeOptions> & {
    dispatcher?: ControllableDispatcher;
  } = {}
): RuntimeFixture {
  const dispatcher = options.dispatcher ?? new ControllableDispatcher();
  const events = new RecordingEventPublisher();
  const runtime = createProviderRuntime({
    dispatcher,
    events,
    // Deterministic retry: skip real delays.
    sleep: () => Promise.resolve(),
    ...options,
  });
  return { runtime, dispatcher, events };
}
