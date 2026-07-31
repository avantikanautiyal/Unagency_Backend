/**
 * Maps Integration OS request metadata to execution context resolve input.
 */

import type { IntelligenceOsIntegrationRequest } from "../contracts/request";
import type { ExecutionContextResolveInput } from "../../../business/execution-context";
import type { TaskIntelligenceReport } from "../../task-intelligence/contracts/result";

export function integrationRequestToContextInput(input: {
  request: IntelligenceOsIntegrationRequest;
  taskReport: TaskIntelligenceReport;
}): ExecutionContextResolveInput {
  const meta = input.request.metadata ?? {};
  const userId = String(meta.userId ?? meta.principalUserId ?? "unknown_user");
  const organizationId = String(
    input.request.organizationId ?? meta.organizationId ?? "unknown_org"
  );

  return {
    requestId: input.request.requestId,
    correlationId: input.request.correlationId ?? input.request.requestId,
    rawPrompt: input.taskReport.request.rawPrompt,
    capabilityId: String(input.taskReport.capabilityMap.primary),
    identity: {
      userId,
      organizationId,
      workspaceId: input.request.workspaceId
        ? String(input.request.workspaceId)
        : meta.workspaceId
          ? String(meta.workspaceId)
          : undefined,
      roles: Array.isArray(meta.roles) ? (meta.roles as string[]) : undefined,
      permissions: Array.isArray(meta.permissions)
        ? (meta.permissions as string[])
        : undefined,
    },
    scope: {
      brandId: meta.brandId ? String(meta.brandId) : undefined,
      projectId: meta.projectId ? String(meta.projectId) : undefined,
      campaignId: meta.campaignId ? String(meta.campaignId) : undefined,
      clientId: meta.clientId ? String(meta.clientId) : undefined,
      requirementId: meta.requirementId ? String(meta.requirementId) : undefined,
      taskId: meta.taskId ? String(meta.taskId) : undefined,
    },
    hints: {
      language: meta.language ? String(meta.language) : undefined,
      locale: meta.locale ? String(meta.locale) : undefined,
      region: input.request.regionHint ?? (meta.region ? String(meta.region) : undefined),
      department: input.request.scenarioHint,
    },
  };
}
