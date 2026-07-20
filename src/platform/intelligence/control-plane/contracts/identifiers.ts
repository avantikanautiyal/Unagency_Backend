/**
 * Control Plane branded identifiers.
 */

declare const __brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [__brand]: B };

export type ControlPlaneResultId = Brand<string, "ControlPlaneResultId">;
export type ExecutionReadyPlanId = Brand<string, "ExecutionReadyPlanId">;

function branded<T extends string>(value: string, label: string): T {
  if (!value?.trim()) throw new Error(`${label} cannot be empty`);
  return value as T;
}

export const asControlPlaneResultId = (v: string): ControlPlaneResultId =>
  branded(v, "ControlPlaneResultId");
export const asExecutionReadyPlanId = (v: string): ExecutionReadyPlanId =>
  branded(v, "ExecutionReadyPlanId");
