/**
 * Credential event publisher port.
 *
 * Purpose: Optionally publish credential lifecycle events on the platform bus.
 * Responsibilities: map credential audit events to envelopes.
 * Usage: Injected into the identity engine; Noop is the default.
 * Future Extension: Filtering and batching.
 */

import type { CredentialAuditEvent } from "../contracts/rotation";

export interface ICredentialEventPublisher {
  publish(event: CredentialAuditEvent): Promise<void>;
}
