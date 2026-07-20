/** Integration identifiers. */

export type IntegrationResultId = string & { readonly __brand: "IntegrationResultId" };
export type IntegrationTraceId = string & { readonly __brand: "IntegrationTraceId" };
export type BridgeInvocationId = string & { readonly __brand: "BridgeInvocationId" };

export function asIntegrationResultId(id: string): IntegrationResultId {
  return id as IntegrationResultId;
}

export function asIntegrationTraceId(id: string): IntegrationTraceId {
  return id as IntegrationTraceId;
}

export function asBridgeInvocationId(id: string): BridgeInvocationId {
  return id as BridgeInvocationId;
}
