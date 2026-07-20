/**
 * Policy repository and evaluator.
 */

import { success, failure, type Result } from "../../shared/result";
import { NotFoundError } from "../../shared/errors";
import type { GovernanceRequest } from "../contracts/request";
import type { PolicyRule, PolicyEvaluationResult, PolicyEvaluationReport } from "../contracts/policies";
import type { IPolicyRepository, IPolicyEvaluator } from "../interfaces/execution-governance";
import { DEFAULT_POLICY_PACK } from "./default-policy-pack";

export class InMemoryPolicyRepository implements IPolicyRepository {
  constructor(private readonly policies: readonly PolicyRule[] = DEFAULT_POLICY_PACK) {}

  list(): Result<readonly PolicyRule[]> {
    return success(this.policies);
  }

  get(policyId: string): Result<PolicyRule> {
    const found = this.policies.find((p) => String(p.policyId) === policyId);
    if (!found) return failure(new NotFoundError(`policy not found: ${policyId}`));
    return success(found);
  }
}

export class DefaultPolicyEvaluator implements IPolicyEvaluator {
  constructor(private readonly createId: (prefix: string) => string = (p) => `${p}_1`) {}

  evaluate(request: GovernanceRequest, policies: readonly PolicyRule[]): Result<PolicyEvaluationReport> {
    const evaluations: PolicyEvaluationResult[] = [];
    const nodeCount = request.workflowExecutionPlan.graph.nodes.length;
    const workflowPlan = request.workflowExecutionPlan;
    const estimatedCost = nodeCount * 25;
    const estimatedTokens = nodeCount * 8000;

    for (const policy of policies.filter((p) => p.enabled)) {
      let passed = true;
      let message = "Policy satisfied";
      let actualValue: number | string | undefined;

      switch (policy.kind) {
        case "max_execution_cost": {
          const limit = request.budgetLimit ?? policy.threshold ?? 500;
          actualValue = estimatedCost;
          passed = estimatedCost <= limit;
          message = passed ? "Within budget" : `Cost ${estimatedCost} exceeds limit ${limit}`;
          break;
        }
        case "max_token_budget": {
          const limit = request.tokenBudgetLimit ?? policy.threshold ?? 500000;
          actualValue = estimatedTokens;
          passed = estimatedTokens <= limit;
          message = passed ? "Within token budget" : `Tokens ${estimatedTokens} exceed limit ${limit}`;
          break;
        }
        case "max_latency": {
          const limit = policy.threshold ?? 300000;
          const estimatedMs = workflowPlan.stages.reduce((s, st) => s + st.estimatedDurationMinutes, 0) * 60000;
          actualValue = estimatedMs;
          passed = estimatedMs <= limit;
          message = passed ? "Within latency threshold" : "Latency threshold exceeded";
          break;
        }
        case "mandatory_approvals":
          passed = request.workflowExecutionPlan.approvalPlan.gates.length > 0;
          message = passed ? "Approval gates present" : "Missing mandatory approval gates";
          break;
        case "allowed_regions": {
          const region = request.regionHint ?? "us";
          passed = (policy.allowedValues ?? []).includes(region);
          message = passed ? `Region ${region} allowed` : `Region ${region} not in allowed list`;
          break;
        }
        default:
          passed = true;
          message = `${policy.name} evaluated`;
      }

      evaluations.push({
        policyId: policy.policyId,
        kind: policy.kind,
        passed,
        actualValue,
        threshold: policy.threshold,
        message,
      });
    }

    const failed = evaluations.filter((e) => !e.passed).map((e) => e.policyId);

    return success({
      reportId: this.createId("pol_eval"),
      evaluations,
      allPassed: failed.length === 0,
      failedPolicies: failed,
      rationale: `${evaluations.length} policies evaluated, ${failed.length} failed`,
    });
  }
}
