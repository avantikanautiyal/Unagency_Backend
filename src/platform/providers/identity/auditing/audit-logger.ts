/**
 * In-memory credential audit logger.
 *
 * Purpose: Record credential lifecycle audit events.
 * Responsibilities: append + query audit events. No secrets, ever.
 * Usage: Injected into the identity engine and store wiring.
 * Future Extension: Bridge to the platform audit sink (M9 Governance).
 */

import type { CredentialAuditEventType } from "../contracts/enums";
import type { CredentialAuditEvent } from "../contracts/rotation";
import type { IAuditCredentialLogger } from "../interfaces/audit-logger";

export class InMemoryAuditCredentialLogger implements IAuditCredentialLogger {
  private readonly events: CredentialAuditEvent[] = [];

  record(event: CredentialAuditEvent): void {
    this.events.push(event);
  }

  list(): readonly CredentialAuditEvent[] {
    return [...this.events];
  }

  listByType(
    type: CredentialAuditEventType
  ): readonly CredentialAuditEvent[] {
    return this.events.filter((e) => e.type === type);
  }
}
