/**
 * Rotation and audit contracts.
 *
 * Purpose: Immutable rotation results and audit events.
 * Responsibilities: Describe rotation outcomes and audit records (no secrets).
 * Usage: Produced by the rotation engine and audit logger.
 * Future Extension: Rotation provenance chains.
 */

import type { ProviderId } from "../../../core/identifiers";
import type {
  CredentialAuditEventType,
  RotationReason,
} from "./enums";
import type { CredentialId } from "./identifiers";

export interface CredentialRotationResult {
  readonly credentialId: CredentialId;
  readonly providerId: ProviderId;
  readonly reason: RotationReason;
  readonly previousSecretRef: string;
  readonly newSecretRef: string;
  readonly rotatedAt: string;
}

export interface CredentialAuditEvent {
  readonly type: CredentialAuditEventType;
  readonly credentialId: CredentialId;
  readonly providerId: ProviderId;
  readonly at: string;
  readonly actor?: string;
  /** Audit metadata; must never contain secret material. */
  readonly metadata?: Readonly<Record<string, unknown>>;
}
