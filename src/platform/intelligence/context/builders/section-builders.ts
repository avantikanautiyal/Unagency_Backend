/**
 * Independent section builders using resolvers + request defaults.
 */

import type { ICapabilityRegistry } from "../../capability-registry/interfaces/capability-registry";
import { asCapabilityId } from "../../shared/identifiers";
import { success } from "../../shared/result";
import type { Result } from "../../shared/result";
import type { ContextBuildRequest } from "../contracts/context-build-request";
import type {
  AssetContextSection,
  BrandContextSection,
  CapabilityContextSection,
  ExecutionContextSection,
  LanguageContextSection,
  LocaleContextSection,
  OrganizationContextSection,
  PlatformContextSection,
  ProjectContextSection,
  RequirementContextSection,
  RoleContextSection,
  SecurityContextSection,
  TaskContextSection,
  TimeZoneContextSection,
  UserContextSection,
  WorkspaceContextSection,
} from "../contracts/context-sections";
import type {
  IAssetContextBuilder,
  IBrandContextBuilder,
  ICapabilityContextBuilder,
  IExecutionContextBuilder,
  ILanguageContextBuilder,
  IOrganizationContextBuilder,
  IPlatformContextBuilder,
  IProjectContextBuilder,
  IRequirementContextBuilder,
  IRoleContextBuilder,
  ISecurityContextBuilder,
  ITaskContextBuilder,
  IUserContextBuilder,
  IWorkspaceContextBuilder,
} from "../interfaces/builders";
import type {
  IAssetContextResolver,
  IBrandContextResolver,
  ICapabilityContextResolver,
  IOrganizationContextResolver,
  IUserContextResolver,
  IWorkspaceContextResolver,
} from "../interfaces/resolvers";

export class OrganizationContextBuilder implements IOrganizationContextBuilder {
  constructor(private readonly resolver: IOrganizationContextResolver) {}

  async build(
    request: ContextBuildRequest
  ): Promise<Result<OrganizationContextSection>> {
    const resolved = await this.resolver.resolve(request);
    const facts = resolved.ok ? resolved.value.facts : {};
    return success({
      organizationId: String(request.organizationId),
      name:
        typeof facts.name === "string" ? facts.name : undefined,
      planTier:
        typeof request.attributes?.planTier === "string"
          ? request.attributes.planTier
          : undefined,
      attributes: request.attributes,
    });
  }
}

export class WorkspaceContextBuilder implements IWorkspaceContextBuilder {
  constructor(private readonly resolver: IWorkspaceContextResolver) {}

  async build(
    request: ContextBuildRequest
  ): Promise<Result<WorkspaceContextSection>> {
    const resolved = await this.resolver.resolve(request);
    const facts = resolved.ok ? resolved.value.facts : {};
    return success({
      workspaceId: String(request.workspaceId),
      name: typeof facts.name === "string" ? facts.name : undefined,
    });
  }
}

export class ProjectContextBuilder implements IProjectContextBuilder {
  async build(
    request: ContextBuildRequest
  ): Promise<Result<ProjectContextSection>> {
    return success({
      projectId: request.projectId,
      name:
        typeof request.attributes?.projectName === "string"
          ? request.attributes.projectName
          : undefined,
      status:
        typeof request.attributes?.projectStatus === "string"
          ? request.attributes.projectStatus
          : undefined,
    });
  }
}

export class RequirementContextBuilder implements IRequirementContextBuilder {
  async build(
    request: ContextBuildRequest
  ): Promise<Result<RequirementContextSection>> {
    return success({
      requirementId: request.requirementId,
      title:
        typeof request.attributes?.requirementTitle === "string"
          ? request.attributes.requirementTitle
          : undefined,
    });
  }
}

export class TaskContextBuilder implements ITaskContextBuilder {
  async build(
    request: ContextBuildRequest
  ): Promise<Result<TaskContextSection>> {
    return success({
      taskId: request.taskId,
      title:
        typeof request.attributes?.taskTitle === "string"
          ? request.attributes.taskTitle
          : undefined,
      status:
        typeof request.attributes?.taskStatus === "string"
          ? request.attributes.taskStatus
          : undefined,
    });
  }
}

export class UserContextBuilder implements IUserContextBuilder {
  constructor(private readonly resolver: IUserContextResolver) {}

  async build(
    request: ContextBuildRequest
  ): Promise<Result<UserContextSection>> {
    const resolved = await this.resolver.resolve(request);
    const facts = resolved.ok ? resolved.value.facts : {};
    return success({
      userId: request.userId ? String(request.userId) : undefined,
      displayName:
        typeof facts.displayName === "string" ? facts.displayName : undefined,
    });
  }
}

export class RoleContextBuilder implements IRoleContextBuilder {
  async build(
    request: ContextBuildRequest
  ): Promise<Result<RoleContextSection>> {
    const roles = Array.isArray(request.attributes?.roles)
      ? (request.attributes.roles as string[])
      : [];
    const permissions = Array.isArray(request.attributes?.permissions)
      ? (request.attributes.permissions as string[])
      : [];
    return success({ roles, permissions });
  }
}

export class CapabilityContextBuilder implements ICapabilityContextBuilder {
  constructor(
    private readonly resolver: ICapabilityContextResolver,
    private readonly capabilityRegistry?: ICapabilityRegistry
  ) {}

  async build(
    request: ContextBuildRequest
  ): Promise<Result<CapabilityContextSection>> {
    await this.resolver.resolve(request);
    const capabilityId = String(request.capabilityId);
    let name: string | undefined;
    let category: string | undefined;
    let tags: readonly string[] | undefined;
    let status: string | undefined;

    if (this.capabilityRegistry) {
      const resolved = this.capabilityRegistry.resolve(
        asCapabilityId(capabilityId),
        { version: request.capabilityVersion }
      );
      if (resolved.ok) {
        name = resolved.value.name;
        category = resolved.value.category;
        tags = resolved.value.tags;
        status = resolved.value.status;
      }
    }

    return success({
      capabilityId,
      capabilityVersion: request.capabilityVersion,
      name,
      category,
      tags,
      status,
    });
  }
}

export class ExecutionContextBuilder implements IExecutionContextBuilder {
  async build(
    request: ContextBuildRequest
  ): Promise<Result<ExecutionContextSection>> {
    return success({
      priority: request.priority,
      inputHints: request.inputHints,
      correlationId: request.correlationId,
      attributes: request.attributes,
    });
  }
}

export class BrandContextBuilder implements IBrandContextBuilder {
  constructor(private readonly resolver: IBrandContextResolver) {}

  async build(
    request: ContextBuildRequest
  ): Promise<Result<BrandContextSection>> {
    const resolved = await this.resolver.resolve(request);
    const facts = resolved.ok ? resolved.value.facts : {};
    return success({
      brandId: typeof facts.brandId === "string" ? facts.brandId : undefined,
      name:
        typeof facts.name === "string"
          ? facts.name
          : typeof request.attributes?.brandName === "string"
            ? request.attributes.brandName
            : undefined,
      voice: typeof facts.voice === "string" ? facts.voice : undefined,
      tone: typeof facts.tone === "string" ? facts.tone : undefined,
      colors: typeof facts.colors === "string" ? facts.colors : undefined,
      visualIdentity:
        typeof facts.visualIdentity === "string"
          ? facts.visualIdentity
          : typeof request.attributes?.brandVisualIdentity === "string"
            ? request.attributes.brandVisualIdentity
            : undefined,
      guidelines: Array.isArray(request.attributes?.brandGuidelines)
        ? (request.attributes.brandGuidelines as string[])
        : undefined,
    });
  }
}

export class AssetContextBuilder implements IAssetContextBuilder {
  constructor(private readonly resolver: IAssetContextResolver) {}

  async build(
    request: ContextBuildRequest
  ): Promise<Result<AssetContextSection>> {
    const resolved = await this.resolver.resolve(request);
    const facts = resolved.ok ? resolved.value.facts : {};
    const assetIds = Array.isArray(facts.assetIds)
      ? (facts.assetIds as string[])
      : [];
    return success({ assetIds });
  }
}

export class SecurityContextBuilder implements ISecurityContextBuilder {
  async build(
    request: ContextBuildRequest
  ): Promise<Result<SecurityContextSection>> {
    const permissions = Array.isArray(request.attributes?.permissions)
      ? (request.attributes.permissions as string[])
      : [];
    return success({
      classification:
        typeof request.attributes?.classification === "string"
          ? request.attributes.classification
          : "internal",
      requiredPermissions: permissions,
    });
  }
}

export class LanguageContextBuilder implements ILanguageContextBuilder {
  async build(request: ContextBuildRequest): Promise<
    Result<{
      language: LanguageContextSection;
      locale: LocaleContextSection;
      timeZone: TimeZoneContextSection;
    }>
  > {
    return success({
      language: {
        language: request.language ?? "en",
        fallbackLanguage: "en",
      },
      locale: {
        locale: request.locale ?? "en-US",
        currency:
          typeof request.attributes?.currency === "string"
            ? request.attributes.currency
            : "USD",
      },
      timeZone: {
        timeZone: request.timeZone ?? "UTC",
      },
    });
  }
}

export class PlatformContextBuilder implements IPlatformContextBuilder {
  constructor(
    private readonly platformName = "UNAGENCY Intelligence Platform",
    private readonly platformVersion = "0.1.0",
    private readonly environment = "development"
  ) {}

  async build(
    _request: ContextBuildRequest
  ): Promise<Result<PlatformContextSection>> {
    return success({
      platformName: this.platformName,
      platformVersion: this.platformVersion,
      environment: this.environment,
    });
  }
}
