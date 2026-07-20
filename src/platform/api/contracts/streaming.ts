/**
 * Streaming contracts — provider-agnostic.
 */

import type { StreamEventKind, StreamTransport } from "./enums";

export interface StreamSubscription {
  readonly subscriptionId: string;
  readonly executionId: string;
  readonly transport: StreamTransport;
  readonly createdAt: string;
}

export interface StreamEvent {
  readonly eventId: string;
  readonly subscriptionId: string;
  readonly executionId: string;
  readonly kind: StreamEventKind;
  readonly sequence: number;
  readonly at: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface SseFrame {
  readonly event: string;
  readonly data: string;
  readonly id: string;
}
