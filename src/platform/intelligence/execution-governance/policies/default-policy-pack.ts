/**
 * Configurable policy seed — loaded via repository, not hardcoded in evaluators.
 */

import { asPolicyId } from "../contracts/identifiers";
import type { PolicyRule } from "../contracts/policies";

export const DEFAULT_POLICY_PACK: readonly PolicyRule[] = [
  {
    policyId: asPolicyId("pol_max_cost"),
    kind: "max_execution_cost",
    name: "Maximum Execution Cost",
    enabled: true,
    threshold: 500,
    mandatory: true,
    description: "Total execution cost must not exceed budget limit",
  },
  {
    policyId: asPolicyId("pol_max_tokens"),
    kind: "max_token_budget",
    name: "Maximum Token Budget",
    enabled: true,
    threshold: 500000,
    mandatory: true,
    description: "Total token consumption must not exceed limit",
  },
  {
    policyId: asPolicyId("pol_max_latency"),
    kind: "max_latency",
    name: "Maximum Latency",
    enabled: true,
    threshold: 86400000,
    mandatory: false,
    description: "Workflow must complete within latency threshold (ms, default 24h)",
  },
  {
    policyId: asPolicyId("pol_mandatory_approvals"),
    kind: "mandatory_approvals",
    name: "Mandatory Approvals",
    enabled: true,
    allowedValues: ["brand", "human"],
    mandatory: true,
    description: "Brand and human approval required for launch workflows",
  },
  {
    policyId: asPolicyId("pol_allowed_regions"),
    kind: "allowed_regions",
    name: "Allowed Regions",
    enabled: true,
    allowedValues: ["us", "eu", "apac"],
    mandatory: false,
    description: "Execution restricted to allowed regions",
  },
  {
    policyId: asPolicyId("pol_confidential"),
    kind: "confidential_workflow",
    name: "Confidential Workflow",
    enabled: false,
    mandatory: false,
    description: "Additional controls for confidential workflows",
  },
];
