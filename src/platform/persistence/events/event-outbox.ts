/**
 * Domain event store + outbox (no broker).
 */

import { failure, success, type Result } from "../../intelligence/shared/result";
import { NotFoundError } from "../../intelligence/shared/errors";
import type { DomainEventRecord, OutboxMessage } from "../contracts";
import type { IEventStore, IOutboxStore } from "../interfaces";

export class InMemoryEventStore implements IEventStore {
  private readonly events: DomainEventRecord[] = [];

  async append(event: DomainEventRecord): Promise<Result<void>> {
    this.events.push(event);
    return success(undefined);
  }

  async listByAggregate(
    aggregateType: string,
    aggregateId: string
  ): Promise<Result<readonly DomainEventRecord[]>> {
    return success(
      this.events.filter(
        (e) => e.aggregateType === aggregateType && e.aggregateId === aggregateId
      )
    );
  }

  async replay(fromEventId?: string): Promise<Result<readonly DomainEventRecord[]>> {
    if (!fromEventId) return success([...this.events]);
    const idx = this.events.findIndex((e) => e.eventId === fromEventId);
    if (idx < 0) return success([...this.events]);
    return success(this.events.slice(idx));
  }
}

export class InMemoryOutboxStore implements IOutboxStore {
  private readonly messages: OutboxMessage[] = [];

  constructor(
    private readonly nowIso: () => string,
    private readonly createId: (prefix: string) => string,
    private readonly eventStore: IEventStore
  ) {}

  async enqueue(event: DomainEventRecord): Promise<Result<OutboxMessage>> {
    await this.eventStore.append(event);
    const msg: OutboxMessage = {
      outboxId: this.createId("outbox"),
      event,
      status: "pending",
      createdAt: this.nowIso(),
      attempts: 0,
    };
    this.messages.push(msg);
    return success(msg);
  }

  async listPending(limit = 100): Promise<Result<readonly OutboxMessage[]>> {
    return success(this.messages.filter((m) => m.status === "pending").slice(0, limit));
  }

  async markPublished(outboxId: string): Promise<Result<void>> {
    const msg = this.messages.find((m) => m.outboxId === outboxId);
    if (!msg) return failure(new NotFoundError("outbox message not found"));
    const idx = this.messages.indexOf(msg);
    this.messages[idx] = {
      ...msg,
      status: "published",
      publishedAt: this.nowIso(),
      attempts: msg.attempts + 1,
    };
    return success(undefined);
  }

  async markFailed(outboxId: string): Promise<Result<void>> {
    const msg = this.messages.find((m) => m.outboxId === outboxId);
    if (!msg) return failure(new NotFoundError("outbox message not found"));
    const idx = this.messages.indexOf(msg);
    this.messages[idx] = {
      ...msg,
      status: "failed",
      attempts: msg.attempts + 1,
    };
    return success(undefined);
  }
}
