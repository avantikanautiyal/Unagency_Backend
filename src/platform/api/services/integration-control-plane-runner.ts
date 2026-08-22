/**
 * Canonical ingress: IntelligenceGateway → Orchestrator → IntegrationDispatcher → pipeline.
 * Falls back to direct integration.run only when the gateway is not wired.
 */

import type { IIntelligenceGateway } from "../../intelligence/gateway/interfaces/intelligence-gateway";
import type { IIntelligenceOsIntegrationEngine } from "../../intelligence/integration/interfaces/integration";
import type { IntelligenceOsIntegrationRequest } from "../../intelligence/integration/contracts/request";
import type { IntelligenceOsIntegrationReport } from "../../intelligence/integration/contracts/result";
import { failure, success, type Result } from "../../intelligence/shared/result";
import { ValidationError } from "../../intelligence/shared/errors";
import { asOrganizationId, asWorkspaceId } from "../../intelligence/shared/identifiers";
import { INTEGRATION_REPORT_SESSION_KEY } from "../../intelligence/orchestrator/dispatcher/integration-dispatcher";

export const INTEGRATION_REPORT_OUTPUT_KEY = INTEGRATION_REPORT_SESSION_KEY;

/** Platform default when callers omit workspaceId — matches async coordinator + tool runtime. */
export const DEFAULT_CONTROL_PLANE_WORKSPACE_ID = "ws_default";

export function resolveControlPlaneWorkspaceId(workspaceId?: string): string {
  const trimmed = workspaceId?.trim();
  return trimmed || DEFAULT_CONTROL_PLANE_WORKSPACE_ID;
}

export type IntegrationControlPlaneRunInput = {
  readonly gateway?: IIntelligenceGateway;
  readonly integration: IIntelligenceOsIntegrationEngine;
  readonly request: IntelligenceOsIntegrationRequest;
  readonly capabilityId: string;
  readonly organizationId: string;
  readonly workspaceId?: string;
  readonly apiExecutionId?: string;
};

export function extractIntegrationReportFromGatewayOutput(
  output: Readonly<Record<string, unknown>> | undefined
): IntelligenceOsIntegrationReport | undefined {
  if (!output) return undefined;
  const embedded = output[INTEGRATION_REPORT_OUTPUT_KEY];
  if (!embedded || typeof embedded !== "object") return undefined;
  const candidate = embedded as IntelligenceOsIntegrationReport;
  if (!candidate.artifacts || typeof candidate.success !== "boolean") {
    return undefined;
  }
  return candidate;
}

/**
 * Run the 13-stage pipeline through the intelligence control plane when possible.
 */
export async function runIntegrationViaControlPlane(
  input: IntegrationControlPlaneRunInput
): Promise<Result<IntelligenceOsIntegrationReport>> {
  if (input.gateway) {
    const workspaceId = resolveControlPlaneWorkspaceId(input.workspaceId);
    const attributes: Record<string, unknown> = {
      ...(input.request.metadata ?? {}),
      rawPrompt: input.request.rawPrompt,
      capabilityId: input.capabilityId,
      capabilityHint: input.capabilityId,
      correlationId: input.request.correlationId,
      ...(input.apiExecutionId
        ? { apiExecutionId: input.apiExecutionId, executionId: input.apiExecutionId }
        : {}),
    };

    const gatewayResult = await input.gateway.invokeCapability({
      capabilityId: input.capabilityId,
      organizationId: asOrganizationId(input.organizationId),
      workspaceId: asWorkspaceId(workspaceId),
      input: attributes,
      correlationId: input.request.correlationId,
    });

    if (!gatewayResult.ok) {
      return failure(gatewayResult.error);
    }

    const report = extractIntegrationReportFromGatewayOutput(gatewayResult.value.output);
    if (report) {
      return success(report);
    }

    return failure(
      new ValidationError(
        "Intelligence Gateway completed without integration report — refusing silent fallback"
      )
    );
  }

  return input.integration.run(input.request);
}
