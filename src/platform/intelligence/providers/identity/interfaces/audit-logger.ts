/**
 * Credential audit logger port.
 *
 * Purpose: Record credential lifecycle audit events (no secrets).
 * Responsibilities: record and list audit events.
 * Usage: Injected into the identity engine and store wiring.
 * Future Extension: Bridge to the platform audit sink (M9 Governance).
 */

import type { CredentialAuditEvent } from "../contracts/rotation";
import type { CredentialAuditEventType } from "../contracts/enums";

export interface IAuditCredentialLogger {
  record(event: CredentialAuditEvent): void;
  list(): readonly CredentialAuditEvent[];
  listByType(type: CredentialAuditEventType): readonly CredentialAuditEvent[];
}
