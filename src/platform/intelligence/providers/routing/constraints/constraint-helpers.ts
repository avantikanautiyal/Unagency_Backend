/**
 * Constraint helpers.
 */

import type { RoutingConstraint } from "../contracts/policy";

export function requiredConstraints(
  constraints: readonly RoutingConstraint[]
): readonly RoutingConstraint[] {
  return constraints.filter((c) => c.required);
}
