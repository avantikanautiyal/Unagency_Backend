/**
 * Workflow Intelligence branded identifiers.
 */

declare const __brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [__brand]: B };

export type WorkflowNodeId = Brand<string, "WorkflowNodeId">;
export type WorkflowEdgeId = Brand<string, "WorkflowEdgeId">;
export type WorkflowGraphId = Brand<string, "WorkflowGraphId">;
export type WorkflowPlanId = Brand<string, "WorkflowPlanId">;
export type WorkflowIntelligenceResultId = Brand<string, "WorkflowIntelligenceResultId">;
export type CheckpointId = Brand<string, "CheckpointId">;

function branded<T extends string>(value: string, label: string): T {
  if (!value?.trim()) throw new Error(`${label} cannot be empty`);
  return value as T;
}

export const asWorkflowNodeId = (v: string): WorkflowNodeId => branded(v, "WorkflowNodeId");
export const asWorkflowEdgeId = (v: string): WorkflowEdgeId => branded(v, "WorkflowEdgeId");
export const asWorkflowGraphId = (v: string): WorkflowGraphId => branded(v, "WorkflowGraphId");
export const asWorkflowPlanId = (v: string): WorkflowPlanId => branded(v, "WorkflowPlanId");
export const asWorkflowIntelligenceResultId = (v: string): WorkflowIntelligenceResultId =>
  branded(v, "WorkflowIntelligenceResultId");
export const asCheckpointId = (v: string): CheckpointId => branded(v, "CheckpointId");
