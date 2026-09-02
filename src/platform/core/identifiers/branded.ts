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
export type WorkflowId = Brand<string, "WorkflowId">;
export type AgentId = Brand<string, "AgentId">;
export type PromptId = Brand<string, "PromptId">;
export type ContextId = Brand<string, "ContextId">;
export type KnowledgeId = Brand<string, "KnowledgeId">;
export type ProviderId = Brand<string, "ProviderId">;
export type PluginId = Brand<string, "PluginId">;
export type UserId = Brand<string, "UserId">;
export type EventId = Brand<string, "EventId">;
export type AuditEventId = Brand<string, "AuditEventId">;
export type ModuleId = Brand<string, "ModuleId">;

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

export function asWorkflowId(value: string): WorkflowId {
  return value as WorkflowId;
}

export function asAgentId(value: string): AgentId {
  return value as AgentId;
}

export function asPromptId(value: string): PromptId {
  return value as PromptId;
}

export function asContextId(value: string): ContextId {
  return value as ContextId;
}

export function asKnowledgeId(value: string): KnowledgeId {
  return value as KnowledgeId;
}

export function asProviderId(value: string): ProviderId {
  return value as ProviderId;
}

export function asPluginId(value: string): PluginId {
  return value as PluginId;
}

export function asUserId(value: string): UserId {
  return value as UserId;
}

export function asEventId(value: string): EventId {
  return value as EventId;
}

export function asAuditEventId(value: string): AuditEventId {
  return value as AuditEventId;
}

export function asModuleId(value: string): ModuleId {
  return value as ModuleId;
}
