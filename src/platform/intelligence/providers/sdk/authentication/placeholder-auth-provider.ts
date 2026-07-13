/**
 * Placeholder SDK authentication provider.
 *
 * Purpose: Validate and apply auth metadata without real authentication.
 * Responsibilities: validate kind, produce non-secret header hints.
 * Usage: Injected into wrappers/engine.
 * Future Extension: OAuth flows, token refresh via Identity platform.
 *
 * NO secrets. NO networking. NO OAuth implementation.
 */

import { failure, success, type Result } from "../../../shared/result";
import { ValidationError } from "../../../shared/errors";
import type { SdkAuthentication } from "../contracts/authentication";
import type { ISdkAuthenticationProvider } from "../interfaces/engines";

export class PlaceholderSdkAuthenticationProvider
  implements ISdkAuthenticationProvider
{
  validate(auth: SdkAuthentication): Result<void> {
    if (!auth.kind) {
      return failure(new ValidationError("authentication kind is required"));
    }
    if (auth.kind === "api_key" && !auth.credentialRef) {
      return failure(
        new ValidationError("api_key authentication requires credentialRef")
      );
    }
    return success(undefined);
  }

  applyHeaders(
    auth: SdkAuthentication
  ): Result<Readonly<Record<string, string>>> {
    const validated = this.validate(auth);
    if (!validated.ok) {
      return validated;
    }
    // Placeholder headers only — no secret values.
    switch (auth.kind) {
      case "api_key":
        return success({ "x-auth-kind": "api_key" });
      case "bearer":
        return success({ "x-auth-kind": "bearer" });
      case "oauth":
        return success({ "x-auth-kind": "oauth" });
      case "service_account":
        return success({ "x-auth-kind": "service_account" });
      case "token_refresh":
        return success({ "x-auth-kind": "token_refresh" });
      default:
        return success({ "x-auth-kind": "unknown" });
    }
  }

  async refresh(auth: SdkAuthentication): Promise<Result<SdkAuthentication>> {
    return success({ ...auth, metadata: { ...auth.metadata, refreshed: true } });
  }
}
