/**
 * Routing identifiers.
 */

declare const __routingBrand: unique symbol;
type Brand<T, B extends string> = T & { readonly [__routingBrand]: B };

export type RoutingDecisionId = Brand<string, "RoutingDecisionId">;
export type RoutingPlanId = Brand<string, "RoutingPlanId">;

export function asRoutingDecisionId(value: string): RoutingDecisionId {
  return value as RoutingDecisionId;
}
export function asRoutingPlanId(value: string): RoutingPlanId {
  return value as RoutingPlanId;
}
