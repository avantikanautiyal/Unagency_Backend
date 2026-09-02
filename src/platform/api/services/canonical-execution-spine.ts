/**
 * Canonical direct execution spine — every AI-producing path uses DirectExecutionEngine.
 * planning_through_routing resolves matrix routing only, then hands off (stream/async)
 * without calling the generation provider.
 */

import {
  asOrganizationId,
  asWorkspaceId,
} from "../../core/identifiers";
import type { DirectExecutionRequest } from "../../direct/contracts";
import type { DirectExecutionReport } from "../../direct/contracts";
import type { IDirectExecutionEngine } from "../../direct/contracts";
import type { CreateExecutionRequest } from "../contracts";
import type { AuthPrincipal } from "../contracts/auth";

/** Handoff payload after canonical direct execution ingress. */
export interface CanonicalStreamHandoff {
  readonly executionId: string;
  readonly correlationId: string;
  readonly trustedOrganizationId: string;
  readonly providerPrompt: string;
  readonly capabilityIdRaw: string;
  readonly req: CreateExecutionRequest;
  readonly workingMetadata?: Record<string, unknown>;
  readonly principal: AuthPrincipal;
}

/** Authoritative integration mode for production AI execution. */
export const CANONICAL_INTEGRATION_MODE = "full" as const;

/** Planning-only mode — matrix routing without provider generation. */
export const CANONICAL_STREAM_PLANNING_MODE = "planning_through_routing" as const;

export interface CanonicalIntegrationInput {
  readonly executionId: string;
  readonly correlationId: string;
  readonly trustedOrganizationId: string;
  readonly providerPrompt: string;
  readonly req: CreateExecutionRequest;
  readonly workingMetadata?: Record<string, unknown>;
  readonly principal?: AuthPrincipal;
  readonly mode?: typeof CANONICAL_INTEGRATION_MODE | typeof CANONICAL_STREAM_PLANNING_MODE;
}

export function buildCanonicalIntegrationRequest(
  input: CanonicalIntegrationInput
): DirectExecutionRequest {
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

  const scenarioHint =
    typeof meta.scenarioHint === "string" && meta.scenarioHint.trim()
      ? meta.scenarioHint.trim()
      : typeof meta.service === "string" && meta.service.trim()
        ? meta.service.trim()
        : undefined;

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
    scenarioHint,
    metadata: meta,
  };
}

export async function runCanonicalIntegration(
  integration: IDirectExecutionEngine,
  input: CanonicalIntegrationInput
): Promise<
  import("../../core/result").Result<DirectExecutionReport>
> {
  return integration.run(buildCanonicalIntegrationRequest(input));
}

export interface CanonicalRoutingSelection {
  readonly providerId: string;
  readonly modelId: string;
  readonly routingDecisionId?: string;
}

/** Extract provider routing from a completed direct execution report. */
export function extractCanonicalRouting(
  report: DirectExecutionReport,
  fallback: { readonly providerId?: string; readonly modelId?: string } = {}
): CanonicalRoutingSelection {
  const routing = report.artifacts.routing?.plan;
  const runtime = report.artifacts.runtime;

  const providerId = String(
    routing?.primary?.providerId ??
      runtime?.finalProviderId ??
      runtime?.response?.providerId ??
      fallback.providerId ??
      "provider.openai"
  );
  const modelId = String(
    routing?.primary?.modelId ??
      runtime?.finalModelId ??
      fallback.modelId ??
      "gpt-4o"
  );
  const routingDecisionId = undefined;

  return { providerId, modelId, routingDecisionId };
}
