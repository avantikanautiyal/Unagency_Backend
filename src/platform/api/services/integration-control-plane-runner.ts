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

/** Run DirectExecutionEngine for a sync create / distributed job. */
export async function runDirectProviderExecution(
  input: IntegrationControlPlaneRunInput
): Promise<Result<DirectExecutionReport>> {
  return input.integration.run(input.request);
}

