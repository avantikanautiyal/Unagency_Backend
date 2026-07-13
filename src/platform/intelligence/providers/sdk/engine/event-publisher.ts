/**
 * SDK event publishers.
 *
 * Purpose: Optionally publish SDK execution results on the platform bus.
 * Responsibilities: map results to envelopes; no-op fallback.
 * Usage: Injected into the engine.
 * Future Extension: Per-stage SDK events.
 */

import type { EventFactory } from "../../../events/implementations/event-factory";
import type { IEventBus } from "../../../events/interfaces/event-bus";
import type { SdkExecutionResult } from "../contracts/health-result";
import type { ISdkEventPublisher } from "../interfaces/engine";

export class NoopSdkEventPublisher implements ISdkEventPublisher {
  async publishResult(_result: SdkExecutionResult): Promise<void> {
    // Intentionally does nothing.
  }
}

export class EventBusSdkEventPublisher implements ISdkEventPublisher {
  constructor(
    private readonly eventBus: IEventBus,
    private readonly eventFactory: EventFactory
  ) {}

  async publishResult(result: SdkExecutionResult): Promise<void> {
    const envelope = this.eventFactory.create({
      type: `sdk.${result.success ? "completed" : "failed"}`,
      payload: result,
      metadata: {
        sourceModule: "providers/sdk",
        correlationId: result.requestId,
      },
    });
    await this.eventBus.publish(envelope);
  }
}
