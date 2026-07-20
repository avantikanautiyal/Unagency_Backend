/**
 * Task Intelligence branded identifiers.
 */

declare const __brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [__brand]: B };

export type TaskNodeId = Brand<string, "TaskNodeId">;
export type TaskGraphId = Brand<string, "TaskGraphId">;
export type TaskIntelligenceResultId = Brand<string, "TaskIntelligenceResultId">;
export type PlaybookId = Brand<string, "PlaybookId">;
export type DeliverableId = Brand<string, "DeliverableId">;

function branded<T extends string>(value: string, label: string): T {
  if (!value?.trim()) throw new Error(`${label} cannot be empty`);
  return value as T;
}

export const asTaskNodeId = (v: string): TaskNodeId => branded(v, "TaskNodeId");
export const asTaskGraphId = (v: string): TaskGraphId => branded(v, "TaskGraphId");
export const asTaskIntelligenceResultId = (v: string): TaskIntelligenceResultId =>
  branded(v, "TaskIntelligenceResultId");
export const asPlaybookId = (v: string): PlaybookId => branded(v, "PlaybookId");
export const asDeliverableId = (v: string): DeliverableId => branded(v, "DeliverableId");
