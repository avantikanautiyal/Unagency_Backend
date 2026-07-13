/**
 * Transport identifiers.
 *
 * Purpose: Branded ids for sessions, connections, and pools.
 * Responsibilities: Type-safe identifiers (never plain strings).
 * Usage: Referenced across the transport framework.
 * Future Extension: Distributed pool ids.
 */

declare const __transportBrand: unique symbol;
type Brand<T, B extends string> = T & { readonly [__transportBrand]: B };

export type TransportSessionId = Brand<string, "TransportSessionId">;
export type ConnectionId = Brand<string, "ConnectionId">;
export type PoolId = Brand<string, "PoolId">;

export function asTransportSessionId(value: string): TransportSessionId {
  return value as TransportSessionId;
}
export function asConnectionId(value: string): ConnectionId {
  return value as ConnectionId;
}
export function asPoolId(value: string): PoolId {
  return value as PoolId;
}
