/**
 * SDK identifiers.
 *
 * Purpose: Branded ids for SDK clients and executions.
 * Responsibilities: Type-safe identifiers (never plain strings).
 * Usage: Referenced across the SDK framework.
 * Future Extension: Distributed execution ids.
 */

declare const __sdkBrand: unique symbol;
type Brand<T, B extends string> = T & { readonly [__sdkBrand]: B };

export type SdkClientId = Brand<string, "SdkClientId">;
export type SdkExecutionId = Brand<string, "SdkExecutionId">;

export function asSdkClientId(value: string): SdkClientId {
  return value as SdkClientId;
}
export function asSdkExecutionId(value: string): SdkExecutionId {
  return value as SdkExecutionId;
}
