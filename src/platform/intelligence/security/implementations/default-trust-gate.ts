import { AuthorizationError } from "../../shared/errors";
import { failure, success } from "../../shared/result";
import type { Result } from "../../shared/result";
import type { SecurityContext } from "../contracts/security-context";
import type { IAuthorizationPolicy, ITrustGate } from "../interfaces/security";

/**
 * Trust gate that delegates to the authorization policy.
 */
export class DefaultTrustGate implements ITrustGate {
  constructor(private readonly policy: IAuthorizationPolicy) {}

  async assertTrusted(
    context: SecurityContext,
    action: string
  ): Promise<Result<void>> {
    const result = await this.policy.authorize({
      context,
      action,
      resourceType: "intelligence",
    });

    if (!result.ok) {
      return result;
    }

    if (!result.value.allowed) {
      return failure(
        new AuthorizationError("Trust gate denied action", {
          action,
          reason: result.value.reason,
        })
      );
    }

    return success(undefined);
  }
}
