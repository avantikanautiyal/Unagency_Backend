/**
 * Audit contracts — never contain secret values.
 */

import type { AuditAction, AuditOutcome } from "./enums";
import type { SecretId, SecretRef } from "./secret";

export interface SecretAuditEvent {
  readonly eventId: string;
  readonly action: AuditAction;
  readonly outcome: AuditOutcome;
  readonly secretId?: SecretId;
  readonly ref?: SecretRef;
  readonly actor?: string;
  readonly reason?: string;
  readonly durationMs: number;
  readonly at: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
