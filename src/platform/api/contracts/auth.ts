/**
 * Authentication contracts.
 */

import type { AuthScheme, PrincipalKind, RoleName } from "./enums";

export interface AuthCredential {
  readonly scheme: AuthScheme;
  readonly token: string;
  readonly deviceId?: string;
}

export interface AuthPrincipal {
  readonly principalId: string;
  readonly kind: PrincipalKind;
  readonly userId?: string;
  readonly organizationId?: string;
  readonly workspaceId?: string;
  readonly roles: readonly RoleName[];
  readonly apiKeyId?: string;
  readonly serviceAccountId?: string;
  readonly sessionId?: string;
  readonly deviceId?: string;
  readonly expiresAt?: string;
}

export interface AuthSession {
  readonly sessionId: string;
  readonly userId: string;
  readonly organizationId: string;
  readonly deviceId: string;
  readonly scheme: AuthScheme;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly revoked: boolean;
}

export interface IssuedToken {
  readonly accessToken: string;
  readonly refreshToken?: string;
  readonly tokenType: "Bearer";
  readonly expiresInSec: number;
  readonly scheme: AuthScheme;
  readonly sessionId: string;
}

export interface ApiKeyRecord {
  readonly apiKeyId: string;
  readonly organizationId: string;
  readonly name: string;
  readonly hashedKey: string;
  readonly prefix: string;
  readonly roles: readonly RoleName[];
  readonly createdAt: string;
  readonly revoked: boolean;
}
