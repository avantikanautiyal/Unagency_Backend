import { success } from "../../shared/result";
import type { Result } from "../../shared/result";
import type {
  AuthorizationRequest,
  AuthorizationResult,
} from "../contracts/security-context";
import type { IAuthorizationPolicy } from "../interfaces/security";

/**
 * M0 placeholder policy. Always allows.
 * Replace with real policy evaluation in later milestones.
 */
export class AllowAllAuthorizationPolicy implements IAuthorizationPolicy {
  async authorize(
    _request: AuthorizationRequest
  ): Promise<Result<AuthorizationResult>> {
    return success({ allowed: true, reason: "m0_allow_all" });
  }
}
