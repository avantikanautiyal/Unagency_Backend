/**
 * Secret auditor — never persists secret values.
 */

import type { ISecretAuditor } from "../interfaces/secrets";
import type { SecretAuditEvent } from "../contracts/audit";
import type { SecretId } from "../contracts/secret";
import { scrubObject } from "../masking/secret-masker";

export class InMemorySecretAuditor implements ISecretAuditor {
  private readonly events: SecretAuditEvent[] = [];

  constructor(
    private readonly createId: (prefix: string) => string,
    private readonly nowIso: () => string
  ) {}

  record(
    event: Omit<SecretAuditEvent, "eventId" | "at"> & { at?: string }
  ): void {
    const metadata = event.metadata
      ? scrubObject(event.metadata as Record<string, unknown>)
      : undefined;
    this.events.push({
      eventId: this.createId("saudit"),
      action: event.action,
      outcome: event.outcome,
      secretId: event.secretId,
      ref: event.ref,
      actor: event.actor,
      reason: event.reason,
      durationMs: event.durationMs,
      at: event.at ?? this.nowIso(),
      metadata,
    });
  }

  list(secretId?: SecretId): readonly SecretAuditEvent[] {
    if (!secretId) return [...this.events];
    return this.events.filter((e) => e.secretId === secretId);
  }
}
