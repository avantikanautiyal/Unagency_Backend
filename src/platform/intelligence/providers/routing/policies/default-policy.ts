/**
 * Default routing policy applier.
 */

import { success, type Result } from "../../../shared/result";
import type { RoutingRequest } from "../contracts/request";
import type { IRoutingPolicy } from "../interfaces/routing";

export class DefaultRoutingPolicy implements IRoutingPolicy {
  constructor(readonly policyId: string) {}

  apply(request: RoutingRequest): Result<RoutingRequest> {
    if (!request.policy || request.policy.policyId !== this.policyId) {
      return success(request);
    }
    const strategy = request.policy.strategy.kind;
    return success({ ...request, strategy });
  }
}
