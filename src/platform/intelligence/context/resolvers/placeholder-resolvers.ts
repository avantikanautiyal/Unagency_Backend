/**
 * Placeholder context resolvers.
 * Determine availability from the request only — no DB/HTTP.
 */

import { success } from "../../shared/result";
import type { Result } from "../../shared/result";
import type { ContextBuildRequest } from "../contracts/context-build-request";
import type {
  IAssetContextResolver,
  IBrandContextResolver,
  ICapabilityContextResolver,
  IOrganizationContextResolver,
  IUserContextResolver,
  IWorkspaceContextResolver,
  ResolvedContextFacts,
} from "../interfaces/resolvers";

function availableFacts(
  available: boolean,
  facts: Readonly<Record<string, unknown>>
): Result<ResolvedContextFacts> {
  return success({ available, facts });
}

export class PlaceholderOrganizationResolver
  implements IOrganizationContextResolver
{
  readonly kind = "organization" as const;

  async resolve(
    request: ContextBuildRequest
  ): Promise<Result<ResolvedContextFacts>> {
    return availableFacts(Boolean(request.organizationId), {
      organizationId: String(request.organizationId),
      name: request.attributes?.organizationName,
    });
  }
}

export class PlaceholderWorkspaceResolver implements IWorkspaceContextResolver {
  readonly kind = "workspace" as const;

  async resolve(
    request: ContextBuildRequest
  ): Promise<Result<ResolvedContextFacts>> {
    return availableFacts(Boolean(request.workspaceId), {
      workspaceId: String(request.workspaceId),
      name: request.attributes?.workspaceName,
    });
  }
}

export class PlaceholderUserResolver implements IUserContextResolver {
  readonly kind = "user" as const;

  async resolve(
    request: ContextBuildRequest
  ): Promise<Result<ResolvedContextFacts>> {
    return availableFacts(Boolean(request.userId), {
      userId: request.userId ? String(request.userId) : undefined,
      displayName: request.attributes?.userDisplayName,
    });
  }
}

export class PlaceholderBrandResolver implements IBrandContextResolver {
  readonly kind = "brand" as const;

  async resolve(
    request: ContextBuildRequest
  ): Promise<Result<ResolvedContextFacts>> {
    const brandId = request.attributes?.brandId;
    const colors = Array.isArray(request.attributes?.brandColors)
      ? (request.attributes.brandColors as string[]).filter(Boolean).join(", ")
      : typeof request.attributes?.brandColors === "string"
        ? request.attributes.brandColors
        : undefined;
    return availableFacts(brandId !== undefined, {
      brandId,
      name: request.attributes?.brandName,
      voice: request.attributes?.brandVoice,
      tone: request.attributes?.brandTone,
      colors,
      visualIdentity: request.attributes?.brandVisualIdentity,
    });
  }
}

export class PlaceholderAssetResolver implements IAssetContextResolver {
  readonly kind = "asset" as const;

  async resolve(
    request: ContextBuildRequest
  ): Promise<Result<ResolvedContextFacts>> {
    const assetIds = Array.isArray(request.attributes?.assetIds)
      ? (request.attributes?.assetIds as string[])
      : [];
    return availableFacts(assetIds.length > 0, { assetIds });
  }
}

export class PlaceholderCapabilityResolver
  implements ICapabilityContextResolver
{
  readonly kind = "capability" as const;

  async resolve(
    request: ContextBuildRequest
  ): Promise<Result<ResolvedContextFacts>> {
    return availableFacts(Boolean(request.capabilityId), {
      capabilityId: String(request.capabilityId),
      capabilityVersion: request.capabilityVersion,
    });
  }
}
