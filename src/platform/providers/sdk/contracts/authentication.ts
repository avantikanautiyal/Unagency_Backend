/**
 * SDK authentication contracts.
 *
 * Purpose: Describe how an SDK client authenticates (no secrets).
 * Responsibilities: Kind + non-secret metadata only.
 * Usage: SdkRequest, SdkClientDescriptor, auth provider.
 * Future Extension: mTLS, workload identity.
 *
 * Raw secrets are NEVER stored here. Only credential references.
 */

import type { SdkAuthenticationKind } from "./enums";

export interface SdkAuthentication {
  readonly kind: SdkAuthenticationKind;
  /** Non-secret reference to a credential (from Identity platform). */
  readonly credentialRef?: string;
  readonly region?: string;
  readonly scopes?: readonly string[];
  readonly metadata?: Readonly<Record<string, unknown>>;
}
