/**
 * Branded identifier types.
 * Public interfaces must use these — never plain strings for domain IDs.
 */

declare const __brand: unique symbol;

type Brand<T, B extends string> = T & { readonly [__brand]: B };

export type OrganizationId = Brand<string, "OrganizationId">;
export type WorkspaceId = Brand<string, "WorkspaceId">;
export type ExecutionId = Brand<string, "ExecutionId">;
export type CapabilityId = Brand<string, "CapabilityId">;
export type ProviderId = Brand<string, "ProviderId">;
export type UserId = Brand<string, "UserId">;
export type EventId = Brand<string, "EventId">;

export function asOrganizationId(value: string): OrganizationId {
  return value as OrganizationId;
}

export function asWorkspaceId(value: string): WorkspaceId {
  return value as WorkspaceId;
}

export function asExecutionId(value: string): ExecutionId {
  return value as ExecutionId;
}

export function asCapabilityId(value: string): CapabilityId {
  return value as CapabilityId;
}

export function asProviderId(value: string): ProviderId {
  return value as ProviderId;
}

export function asEventId(value: string): EventId {
  return value as EventId;
}

