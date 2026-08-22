/**
 * Canonical AI OS execution spine — every AI-producing path must use these contracts.
 * Stages 1–11 (or planning_through_routing for stream handoff) optimize output before providers.
 */

import {
  asOrganizationId,
  asWorkspaceId,
} from "../../intelligence/shared/identifiers";
import type { IntelligenceOsIntegrationRequest } from "../../intelligence/integration/contracts/request";
import type { IntelligenceOsIntegrationReport } from "../../intelligence/integration/contracts/result";
import type { IIntelligenceOsIntegrationEngine } from "../../intelligence/integration/interfaces/integration";
import type { CreateExecutionRequest } from "../contracts";
import type { AuthPrincipal } from "../contracts/auth";
import type { StructuredBrief } from "../../os";
import { scenarioHintFromBrief } from "../../os";

/** Handoff payload after canonical OS intelligence ingress (brief → plan). */
export interface CanonicalStreamHandoff {
  readonly executionId: string;
  readonly correlationId: string;
  readonly trustedOrganizationId: string;
  readonly providerPrompt: string;
  readonly capabilityIdRaw: string;
  readonly req: CreateExecutionRequest;
  readonly workingMetadata?: Record<string, unknown>;
  readonly structuredBrief?: StructuredBrief;
  readonly structuredBrandContext?: import("../../os").BrandContext;
  readonly structuredKnowledgeContext?: import("../../os").KnowledgeContext;
  readonly structuredExecutionPlan?: import("../../os").ExecutionPlan;
  readonly principal: AuthPrincipal;
}

/** Authoritative integration mode for production AI execution. */
export const CANONICAL_INTEGRATION_MODE = "full" as const;

/** Planning-only mode — stages 1–10 before a streaming provider handoff. */
export const CANONICAL_STREAM_PLANNING_MODE = "planning_through_routing" as const;

export interface CanonicalIntegrationInput {
  readonly executionId: string;
  readonly correlationId: string;
  readonly trustedOrganizationId: string;
  readonly providerPrompt: string;
  readonly req: CreateExecutionRequest;
  readonly workingMetadata?: Record<string, unknown>;
  readonly structuredBrief?: StructuredBrief;
  readonly principal?: AuthPrincipal;
  readonly mode?: typeof CANONICAL_INTEGRATION_MODE | typeof CANONICAL_STREAM_PLANNING_MODE;
}

export function buildCanonicalIntegrationRequest(
  input: CanonicalIntegrationInput
): IntelligenceOsIntegrationRequest {
  const meta = {
    ...(input.req.metadata ?? {}),
    ...(input.workingMetadata ?? {}),
    ...(input.req.toolNames ? { toolNames: input.req.toolNames } : {}),
    ...(input.req.structuredOutput ? { structuredOutput: input.req.structuredOutput } : {}),
    apiExecutionId: input.executionId,
    executionId: input.executionId,
    canonicalPipeline: true,
    integrationMode: input.mode ?? CANONICAL_INTEGRATION_MODE,
    ...(input.principal?.userId ? { userId: input.principal.userId } : {}),
    ...(input.principal?.roles ? { roles: input.principal.roles } : {}),
    ...(input.req.projectId ? { projectId: input.req.projectId } : {}),
    brandId:
      typeof input.req.metadata?.brandId === "string"
        ? input.req.metadata.brandId
        : undefined,
    campaignId:
      typeof input.req.metadata?.campaignId === "string"
        ? input.req.metadata.campaignId
        : undefined,
    ...(input.req.capabilityId
      ? { capabilityHint: input.req.capabilityId, capabilityId: input.req.capabilityId }
      : {}),
  };

  return {
    requestId: input.executionId,
    rawPrompt: input.providerPrompt,
    organizationId: asOrganizationId(input.trustedOrganizationId),
    workspaceId: input.req.workspaceId
      ? asWorkspaceId(input.req.workspaceId)
      : undefined,
    budgetLimit: input.req.budgetLimit,
    tokenBudgetLimit: input.req.tokenBudgetLimit,
    correlationId: input.correlationId,
    mode: input.mode ?? CANONICAL_INTEGRATION_MODE,
    scenarioHint: input.structuredBrief
      ? scenarioHintFromBrief(input.structuredBrief)
      : undefined,
    metadata: meta,
  };
}

export async function runCanonicalIntegration(
  integration: IIntelligenceOsIntegrationEngine,
  input: CanonicalIntegrationInput
): Promise<
  import("../../intelligence/shared/result").Result<IntelligenceOsIntegrationReport>
> {
  return integration.run(buildCanonicalIntegrationRequest(input));
}

export interface CanonicalRoutingSelection {
  readonly providerId: string;
  readonly modelId: string;
  readonly routingDecisionId?: string;
}

/** Extract provider routing from a completed planning or full integration report. */
export function extractCanonicalRouting(
  report: IntelligenceOsIntegrationReport,
  fallback: { readonly providerId?: string; readonly modelId?: string } = {}
): CanonicalRoutingSelection {
  const routing = report.artifacts.routing?.plan;
  const negotiation = report.artifacts.negotiation as
    | { negotiated?: { selectedProviderId?: string; selectedModelId?: string } }
    | undefined;
  const runtime = report.artifacts.runtime;

  const providerId = String(
    routing?.primary?.providerId ??
      negotiation?.negotiated?.selectedProviderId ??
      runtime?.finalProviderId ??
      runtime?.response?.providerId ??
      fallback.providerId ??
      "provider.openai"
  );
  const modelId = String(
    routing?.primary?.modelId ??
      negotiation?.negotiated?.selectedModelId ??
      runtime?.finalModelId ??
      fallback.modelId ??
      "gpt-4o"
  );
  const routingDecisionId =
    typeof report.artifacts.routing?.decisionId === "string"
      ? report.artifacts.routing.decisionId
      : undefined;

  return { providerId, modelId, routingDecisionId };
}
