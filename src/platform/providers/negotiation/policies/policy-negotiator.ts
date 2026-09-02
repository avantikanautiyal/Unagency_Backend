/**
 * Policy negotiator.
 *
 * Purpose: Consult platform/org/capability/identity policies (never mutate).
 * Responsibilities: Gather policy refs and evaluate consultation decisions.
 * Usage: Policy stage of the negotiation pipeline.
 * Future Extension: Attribute-based policy evaluation.
 */

import type { ICapabilityRegistry } from "../../../capability-registry/interfaces/capability-registry";
import { success, type Result } from "../../../core/result";
import type { PolicyEvaluation } from "../contracts/evaluations";
import type { NegotiationContext } from "../interfaces/context";
import type { IPolicyNegotiator } from "../interfaces/negotiators";
import type { IPolicyProvider } from "../interfaces/policy-provider";

export class PolicyNegotiator implements IPolicyNegotiator {
  constructor(
    private readonly policyProvider: IPolicyProvider,
    private readonly capabilityRegistry: ICapabilityRegistry
  ) {}

  negotiate(context: NegotiationContext): Result<PolicyEvaluation> {
    const plan = context.request.plan;
    const refs = new Set<string>(plan.executionPolicy.policyRefs);

    const capabilityResult = this.capabilityRegistry.resolve(plan.capabilityId);
    if (capabilityResult.ok) {
      const policies = capabilityResult.value.policies;
      for (const ref of [
        policies.executionPolicy,
        policies.retryPolicy,
        policies.evaluationPolicy,
        policies.humanReviewPolicy,
        policies.securityPolicy,
        policies.costPolicy,
      ]) {
        if (ref) {
          refs.add(ref.policyId);
        }
      }
    }

    const consulted = [...refs];
    const decisions = this.policyProvider.consult({
      policyRefs: consulted,
      attributes: {
        ...plan.executionPolicy.attributes,
        organizationId: context.request.organizationId,
        workspaceId: context.request.workspaceId,
      },
    });

    const denied = decisions.filter((d) => !d.allowed);
    const reasons = denied.map(
      (d) => d.reason ?? `policy '${d.policyRef}' denied`
    );

    return success({
      satisfied: denied.length === 0,
      consultedPolicies: consulted,
      reasons,
    });
  }
}
