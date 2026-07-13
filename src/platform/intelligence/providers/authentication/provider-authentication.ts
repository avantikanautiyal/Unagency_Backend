/**
 * Provider authentication contracts.
 *
 * Purpose: Describe authentication mechanisms without implementing secrets handling.
 * Responsibilities: Typed auth method contracts (API key, OAuth, etc.).
 * Usage: Referenced by provider adapters in future milestones.
 * Future Extension: Secret-store references, rotation policies.
 */

export type ProviderAuthKind =
  | "api_key"
  | "oauth"
  | "service_account"
  | "jwt"
  | "bearer_token";

export interface ApiKeyAuthenticationContract {
  readonly kind: "api_key";
  readonly headerName?: string;
  readonly queryParameterName?: string;
  /** Secret reference id — never the secret itself. */
  readonly secretRef: string;
}

export interface OAuthAuthenticationContract {
  readonly kind: "oauth";
  readonly tokenUrl: string;
  readonly clientIdRef: string;
  readonly clientSecretRef: string;
  readonly scopes?: readonly string[];
}

export interface ServiceAccountAuthenticationContract {
  readonly kind: "service_account";
  readonly credentialsRef: string;
  readonly audience?: string;
}

export interface JwtAuthenticationContract {
  readonly kind: "jwt";
  readonly issuer?: string;
  readonly audience?: string;
  readonly signingKeyRef: string;
}

export interface BearerTokenAuthenticationContract {
  readonly kind: "bearer_token";
  readonly tokenRef: string;
}

export type ProviderAuthenticationContract =
  | ApiKeyAuthenticationContract
  | OAuthAuthenticationContract
  | ServiceAccountAuthenticationContract
  | JwtAuthenticationContract
  | BearerTokenAuthenticationContract;
