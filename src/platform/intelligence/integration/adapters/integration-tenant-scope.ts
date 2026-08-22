/**
 * Resolve tenant scope for integration post-processing adapters.
 */

import type { IntelligenceOsIntegrationRequest } from "../contracts/request";
import type { IntegrationArtifactBag } from "../contracts/artifacts";

export interface IntegrationTenantScope {
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly executionId: string;
  readonly capabilityId: string;
  readonly brandId?: string;
  readonly userId?: string;
}

export function resolveIntegrationTenant(input: {
  readonly request: IntelligenceOsIntegrationRequest;
  readonly requestId: string;
  readonly bag?: IntegrationArtifactBag;
}): IntegrationTenantScope {
  const meta = input.request.metadata ?? {};
  const organizationId = String(
    input.request.organizationId ?? meta.organizationId ?? "unknown_org"
  );
  const workspaceId = String(
    input.request.workspaceId ?? meta.workspaceId ?? organizationId
  );
  const executionId = String(
    meta.executionId ?? meta.enterpriseExecutionId ?? `${input.requestId}_exec`
  );
  const capabilityId = String(
    input.bag?.task?.capabilityMap.primary ??
      meta.capabilityId ??
      "general"
  );
  const brandId = meta.brandId ? String(meta.brandId) : undefined;
  const userId = meta.userId
    ? String(meta.userId)
    : meta.principalUserId
      ? String(meta.principalUserId)
      : undefined;

  return {
    organizationId,
    workspaceId,
    executionId,
    capabilityId,
    brandId,
    userId,
  };
}

export function extractIntegrationOutputText(bag: IntegrationArtifactBag): string {
  const output =
    bag.consensus?.consensus.canonicalResponse.output ??
    bag.runtime?.response?.output;
  if (output == null) return "";
  if (typeof output === "string") return output.trim();
  if (typeof output === "object") {
    const message =
      typeof (output as { message?: unknown }).message === "string"
        ? (output as { message: string }).message
        : undefined;
    if (message?.trim()) return message.trim();
    try {
      return JSON.stringify(output).slice(0, 4000);
    } catch {
      return String(output);
    }
  }
  return String(output);
}
