/**
 * Execution Governance platform factory.
 */

import { ExecutionGovernanceEngine } from "../engine/execution-governance-engine";
import {
  DefaultApprovalEngine,
  DefaultAuthorizationEngine,
  DefaultEscalationPlanner,
  DefaultGovernanceDecisionEngine,
  DefaultGovernancePlanBuilder,
  DefaultQualityGateValidator,
} from "../governance/default-governance-engines";
import { InMemoryPolicyRepository, DefaultPolicyEvaluator } from "../policies/default-policy-evaluator";
import {
  DefaultRiskEngine,
  DefaultBudgetEngine,
  DefaultComplianceEvaluator,
  DefaultSecurityEvaluator,
  DefaultPrivacyEvaluator,
} from "../risk/default-risk-engine";
import type { IExecutionGovernanceEngine } from "../interfaces/execution-governance";

export interface ExecutionGovernancePlatform {
  readonly engine: IExecutionGovernanceEngine;
}

export interface CreateExecutionGovernancePlatformOptions {
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
  readonly createId?: (prefix: string) => string;
}

export function createExecutionGovernancePlatform(
  options: CreateExecutionGovernancePlatformOptions = {}
): ExecutionGovernancePlatform {
  const createId = options.createId ?? ((p) => `${p}_${Date.now()}`);
  const nowIso = options.nowIso ?? (() => new Date().toISOString());

  const engine = new ExecutionGovernanceEngine({
    policyRepo: new InMemoryPolicyRepository(),
    policyEvaluator: new DefaultPolicyEvaluator(createId),
    risk: new DefaultRiskEngine(createId),
    budget: new DefaultBudgetEngine(createId),
    compliance: new DefaultComplianceEvaluator(createId),
    security: new DefaultSecurityEvaluator(createId),
    privacy: new DefaultPrivacyEvaluator(createId),
    approval: new DefaultApprovalEngine(createId),
    qualityGates: new DefaultQualityGateValidator(createId),
    decision: new DefaultGovernanceDecisionEngine(createId, nowIso),
    authorization: new DefaultAuthorizationEngine(createId),
    escalation: new DefaultEscalationPlanner(createId),
    planBuilder: new DefaultGovernancePlanBuilder(createId, nowIso),
    nowIso: options.nowIso,
    clockMs: options.clockMs,
    createId: options.createId,
  });

  return { engine };
}
