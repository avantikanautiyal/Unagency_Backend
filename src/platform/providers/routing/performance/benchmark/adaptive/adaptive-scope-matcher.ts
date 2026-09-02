/**
 * Step 12 — Scope-based policy matching (narrowest wins).
 */

import type { AdaptiveRoutingScope } from "./adaptive-routing-decision-contract";
import type { AdaptiveRoutingPolicy, RoutingPolicyScope } from "./routing-policy-contract";

function scopeSpecificity(scope: RoutingPolicyScope): number {
  let score = 0;
  if (scope.service) score += 1;
  if (scope.subtype) score += 2;
  if (scope.industry) score += 2;
  if (scope.platform) score += 1;
  if (scope.format) score += 1;
  return score;
}

function scopeMatches(policyScope: RoutingPolicyScope, request: AdaptiveRoutingScope): boolean {
  if (policyScope.service && policyScope.service !== request.service) return false;
  if (policyScope.subtype && policyScope.subtype !== request.subtype) return false;
  if (policyScope.industry && policyScope.industry !== request.industry) return false;
  if (policyScope.platform && policyScope.platform !== request.platform) return false;
  if (policyScope.format && policyScope.format !== request.format) return false;
  return true;
}

export function selectMatchingPolicy(
  policies: readonly AdaptiveRoutingPolicy[],
  scope: AdaptiveRoutingScope,
  _nowIso: () => string,
): AdaptiveRoutingPolicy | undefined {
  const eligible = policies.filter(
    (p) => p.lifecycle === "ACTIVE" && p.enabled && scopeMatches(p.scope, scope),
  );
  if (eligible.length === 0) return undefined;
  return [...eligible].sort((a, b) => scopeSpecificity(b.scope) - scopeSpecificity(a.scope))[0];
}

export function isPolicyExpired(policy: AdaptiveRoutingPolicy, nowIso: () => string): boolean {
  return Boolean(policy.expiresAt && policy.expiresAt < nowIso());
}
