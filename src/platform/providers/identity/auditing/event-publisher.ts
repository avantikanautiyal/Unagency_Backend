/**
 * Credential event publishers.
 *
 * Purpose: Optionally publish credential audit events on the platform bus.
 * Responsibilities: map audit events to envelopes; no-op fallback.
 * Usage: Injected into the identity engine; Noop is the default.
 * Future Extension: Batching and filtering.
 */

import type { EventFactory } from "../../../events/implementations/event-factory";
import type { IEventBus } from "../../../events/interfaces/event-bus";
import type { CredentialAuditEvent } from "../contracts/rotation";
import type { ICredentialEventPublisher } from "../interfaces/event-publisher";

export class NoopCredentialEventPublisher
  implements ICredentialEventPublisher
{
  async publish(_event: CredentialAuditEvent): Promise<void> {
    // Intentionally does nothing.
  }
}

export class EventBusCredentialEventPublisher
  implements ICredentialEventPublisher
{
  constructor(
    private readonly eventBus: IEventBus,
    private readonly eventFactory: EventFactory
  ) {}

  async publish(event: CredentialAuditEvent): Promise<void> {
    const envelope = this.eventFactory.create({
      type: event.type,
      payload: event,
      metadata: {
        sourceModule: "providers/identity",
        correlationId: event.credentialId,
      },
    });
    await this.eventBus.publish(envelope);
  }
}
