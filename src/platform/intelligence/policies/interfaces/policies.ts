/**
 * Cross-platform policy ports.
 * Architecture only — no implementation.
 *
 * Policies are NOT owned by Security alone.
 * They affect runtime, planner, gateway, and future modules.
 */

import type {
  CapabilityId,
  OrganizationId,
  ProviderId,
  WorkspaceId,
} from "../../shared/identifiers";

export interface PolicyDecision {
  readonly allowed: boolean;
  readonly reason?: string;
  readonly attributes?: Readonly<Record<string, unknown>>;
}

export interface PolicyContext {
  readonly organizationId: OrganizationId;
  readonly workspaceId: WorkspaceId;
  readonly actorType?: string;
  readonly attributes?: Readonly<Record<string, unknown>>;
}

export interface IProviderPolicy {
  evaluate(context: PolicyContext, providerId: ProviderId): Promise<PolicyDecision>;
}

export interface ICapabilityPolicy {
  evaluate(
    context: PolicyContext,
    capabilityId: CapabilityId
  ): Promise<PolicyDecision>;
}

export interface IExecutionPolicy {
  evaluate(context: PolicyContext, executionHints?: Readonly<Record<string, unknown>>): Promise<PolicyDecision>;
}

export interface IRetryPolicy {
  evaluate(context: PolicyContext): Promise<{ maxAttempts: number; backoffMs: number }>;
}

export interface ITimeoutPolicy {
  evaluate(context: PolicyContext): Promise<{ timeoutMs: number }>;
}

export interface ICostPolicy {
  evaluate(context: PolicyContext): Promise<{ maxCost?: number; maxTokens?: number }>;
}

export interface IEvaluationPolicy {
  evaluate(context: PolicyContext): Promise<{ enabled: boolean; sampleRate?: number }>;
}

export interface ISecurityPolicy {
  evaluate(context: PolicyContext, action: string): Promise<PolicyDecision>;
}

export interface IQuotaPolicy {
  evaluate(context: PolicyContext, resource: string): Promise<PolicyDecision>;
}

export interface IPolicyEngine {
  readonly providers: IProviderPolicy;
  readonly capabilities: ICapabilityPolicy;
  readonly execution: IExecutionPolicy;
  readonly retry: IRetryPolicy;
  readonly timeout: ITimeoutPolicy;
  readonly cost: ICostPolicy;
  readonly evaluation: IEvaluationPolicy;
  readonly security: ISecurityPolicy;
  readonly quota: IQuotaPolicy;
}
