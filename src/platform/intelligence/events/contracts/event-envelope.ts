import type { EventId } from "../../shared/identifiers";
import type { IntelligenceEventType } from "../types/event-types";

export interface EventMetadata {
  readonly correlationId?: string;
  readonly causationId?: string;
  readonly organizationId?: string;
  readonly workspaceId?: string;
  readonly sourceModule: string;
  readonly attributes?: Readonly<Record<string, unknown>>;
}

export interface EventEnvelope<TPayload = unknown> {
  readonly id: EventId;
  readonly type: IntelligenceEventType;
  readonly occurredAt: string;
  readonly payload: TPayload;
  readonly metadata: EventMetadata;
}
