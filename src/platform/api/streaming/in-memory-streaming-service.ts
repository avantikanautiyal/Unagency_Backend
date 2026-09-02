/**
 * Provider-agnostic streaming service (SSE / WebSocket / chunked abstraction).
 */

import { failure, success, type Result } from "../../core/result";
import { ValidationError, NotFoundError } from "../../core/errors";
import type {
  StreamEvent,
  StreamSubscription,
  StreamTransport,
  SseFrame,
} from "../contracts";
import type { IStreamingService } from "../interfaces";

export class InMemoryStreamingService implements IStreamingService {
  private readonly subscriptions = new Map<string, StreamSubscription>();
  private readonly events = new Map<string, StreamEvent[]>();
  private sequences = new Map<string, number>();

  constructor(
    private readonly nowIso: () => string,
    private readonly createId: (prefix: string) => string
  ) {}

  subscribe(executionId: string, transport: StreamTransport): Result<StreamSubscription> {
    if (!executionId) return failure(new ValidationError("executionId required"));
    const subscriptionId = this.createId("sub");
    const sub: StreamSubscription = {
      subscriptionId,
      executionId,
      transport,
      createdAt: this.nowIso(),
    };
    this.subscriptions.set(subscriptionId, sub);
    this.events.set(subscriptionId, []);
    this.sequences.set(subscriptionId, 0);
    return success(sub);
  }

  push(
    event: Omit<StreamEvent, "eventId" | "sequence" | "at"> & { sequence?: number }
  ): Result<StreamEvent> {
    const sub = this.subscriptions.get(event.subscriptionId);
    if (!sub) return failure(new NotFoundError("subscription not found"));
    if (sub.executionId !== event.executionId) {
      return failure(new ValidationError("execution mismatch"));
    }
    const sequence =
      event.sequence ?? (this.sequences.get(event.subscriptionId) ?? 0) + 1;
    this.sequences.set(event.subscriptionId, sequence);
    const full: StreamEvent = {
      eventId: this.createId("sev"),
      subscriptionId: event.subscriptionId,
      executionId: event.executionId,
      kind: event.kind,
      sequence,
      at: this.nowIso(),
      payload: event.payload,
    };
    this.events.get(event.subscriptionId)!.push(full);
    return success(full);
  }

  poll(subscriptionId: string, afterSequence = 0): Result<readonly StreamEvent[]> {
    const list = this.events.get(subscriptionId);
    if (!list) return failure(new NotFoundError("subscription not found"));
    return success(list.filter((e) => e.sequence > afterSequence));
  }

  toSse(events: readonly StreamEvent[]): Result<readonly SseFrame[]> {
    return success(
      events.map((e) => ({
        event: e.kind,
        id: e.eventId,
        data: JSON.stringify({
          executionId: e.executionId,
          sequence: e.sequence,
          at: e.at,
          ...e.payload,
        }),
      }))
    );
  }
}
