/**
 * Agent Planning branded identifiers.
 */

declare const __brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [__brand]: B };

export type AgentId = Brand<string, "AgentId">;
export type AgentGraphId = Brand<string, "AgentGraphId">;
export type TeamPlanId = Brand<string, "TeamPlanId">;
export type AgentPlanningResultId = Brand<string, "AgentPlanningResultId">;
export type TeamPlaybookId = Brand<string, "TeamPlaybookId">;

function branded<T extends string>(value: string, label: string): T {
  if (!value?.trim()) throw new Error(`${label} cannot be empty`);
  return value as T;
}

export const asAgentId = (v: string): AgentId => branded(v, "AgentId");
export const asAgentGraphId = (v: string): AgentGraphId => branded(v, "AgentGraphId");
export const asTeamPlanId = (v: string): TeamPlanId => branded(v, "TeamPlanId");
export const asAgentPlanningResultId = (v: string): AgentPlanningResultId =>
  branded(v, "AgentPlanningResultId");
export const asTeamPlaybookId = (v: string): TeamPlaybookId => branded(v, "TeamPlaybookId");
