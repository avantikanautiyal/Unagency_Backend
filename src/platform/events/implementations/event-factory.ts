import { asEventId } from "../../core/identifiers";
import type { IClock, IIdGenerator } from "../../core/interfaces";
import type { EventEnvelope, EventMetadata } from "../contracts/event-envelope";
import type { IntelligenceEventType } from "../types/event-types";

export interface CreateEventInput<TPayload> {
  readonly type: IntelligenceEventType;
  readonly payload: TPayload;
  readonly metadata: EventMetadata;
}

export class EventFactory {
  constructor(
    private readonly idGenerator: IIdGenerator,
    private readonly clock: IClock
  ) {}

  create<TPayload>(input: CreateEventInput<TPayload>): EventEnvelope<TPayload> {
    return {
      id: asEventId(this.idGenerator.generate("evt")),
      type: input.type,
      occurredAt: this.clock.nowIso(),
      payload: input.payload,
      metadata: input.metadata,
    };
  }
}
