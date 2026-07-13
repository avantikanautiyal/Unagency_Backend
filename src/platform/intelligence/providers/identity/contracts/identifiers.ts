/**
 * Identity-local branded identifiers.
 *
 * Purpose: Strongly-typed ids owned by the identity platform.
 * Responsibilities: Provide CredentialId without modifying shared (frozen).
 * Usage: Public contracts reference these instead of plain strings.
 * Future Extension: Additional identity ids (e.g. ServiceAccountId).
 */

declare const __identityBrand: unique symbol;

type IdentityBrand<T, B extends string> = T & {
  readonly [__identityBrand]: B;
};

export type CredentialId = IdentityBrand<string, "CredentialId">;

export function asCredentialId(value: string): CredentialId {
  return value as CredentialId;
}
