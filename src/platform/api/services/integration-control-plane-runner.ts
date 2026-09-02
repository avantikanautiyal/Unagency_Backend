/**
 * Direct provider control-plane runner — prompt → DirectExecutionEngine → provider.
 * Name retains "integration" for call-site compatibility; there is no IntegrationPipeline.
 */

import type { IDirectExecutionEngine } from "../../direct/contracts";
import type {
  DirectExecutionRequest,
  DirectExecutionReport,
} from "../../direct/contracts";
import type { Result } from "../../core/result";

/** @deprecated Report key name; value is a DirectExecutionReport. */
export const INTEGRATION_REPORT_OUTPUT_KEY = "integrationReport";

export const DEFAULT_CONTROL_PLANE_WORKSPACE_ID = "ws_default";

export function resolveControlPlaneWorkspaceId(workspaceId?: string): string {
  const trimmed = workspaceId?.trim();
  return trimmed || DEFAULT_CONTROL_PLANE_WORKSPACE_ID;
}

export type IntegrationControlPlaneRunInput = {
  /** DirectExecutionEngine (legacy field name: integration). */
  readonly integration: IDirectExecutionEngine;
  readonly request: DirectExecutionRequest;
  readonly capabilityId: string;
  readonly organizationId: string;
  readonly workspaceId?: string;
  readonly apiExecutionId?: string;
};

export function extractIntegrationReportFromGatewayOutput(
  output: Readonly<Record<string, unknown>> | undefined
): DirectExecutionReport | undefined {
  if (!output) return undefined;
  const embedded = output[INTEGRATION_REPORT_OUTPUT_KEY];
  if (!embedded || typeof embedded !== "object") return undefined;
  const candidate = embedded as DirectExecutionReport;
  if (!candidate.artifacts || typeof candidate.success !== "boolean") {
    return undefined;
  }
  return candidate;
}

/** Run DirectExecutionEngine for a sync create / distributed job. */
export async function runDirectProviderExecution(
  input: IntegrationControlPlaneRunInput
): Promise<Result<DirectExecutionReport>> {
  return input.integration.run(input.request);
}

/** @deprecated Use runDirectProviderExecution — same behavior. */
export async function runIntegrationViaControlPlane(
  input: IntegrationControlPlaneRunInput
): Promise<Result<DirectExecutionReport>> {
  return runDirectProviderExecution(input);
}
