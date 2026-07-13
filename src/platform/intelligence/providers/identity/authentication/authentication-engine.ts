/**
 * Provider authentication engine (placeholder — no networking, no OAuth flow).
 *
 * Purpose: Verify a credential's authentication scheme is usable.
 * Responsibilities: scheme support + structural checks (status, secret present).
 * Usage: Called by the identity engine during session creation.
 * Future Extension: Real OAuth2/JWT verification inside provider adapters.
 *
 * This engine performs NO network calls and never handles raw secrets.
 */

import { failure, success, type Result } from "../../../shared/result";
import type { ProviderAuthenticationResult } from "../contracts/authorization";
import type { AuthenticationScheme } from "../contracts/enums";
import { ProviderAuthenticationError } from "../errors";
import type {
  AuthenticationRequest,
  IProviderAuthenticationEngine,
} from "../interfaces/authentication-engine";

const SUPPORTED_SCHEMES: readonly AuthenticationScheme[] = [
  "api_key",
  "oauth2",
  "bearer_token",
  "jwt",
  "service_account",
  "client_credentials",
  "anonymous",
];

export class ProviderAuthenticationEngine
  implements IProviderAuthenticationEngine
{
  constructor(
    private readonly supportedSchemes: readonly AuthenticationScheme[] = SUPPORTED_SCHEMES
  ) {}

  supports(scheme: AuthenticationScheme): boolean {
    return this.supportedSchemes.includes(scheme);
  }

  authenticate(
    request: AuthenticationRequest
  ): Result<ProviderAuthenticationResult> {
    const { credential, secretPresent } = request;
    const scheme = credential.reference.scheme;
    const reasons: string[] = [];

    if (!this.supports(scheme)) {
      return failure(
        new ProviderAuthenticationError("Unsupported authentication scheme", {
          scheme,
        })
      );
    }

    if (credential.metadata.status !== "active") {
      reasons.push(`credential status is '${credential.metadata.status}'`);
    }

    // Anonymous requires no secret material; every other scheme does.
    if (scheme !== "anonymous" && !secretPresent) {
      reasons.push("secret material is not present");
    }

    const authenticated = reasons.length === 0;
    return success({
      authenticated,
      scheme,
      credentialId: credential.reference.credentialId,
      providerId: credential.reference.providerId,
      reasons,
    });
  }
}
