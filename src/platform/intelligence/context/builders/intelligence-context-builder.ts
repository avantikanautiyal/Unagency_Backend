/**
 * Coordinates independent section builders into IntelligenceContext.
 */

import { randomUUID } from "crypto";
import {
  asCapabilityId,
  asOrganizationId,
  asUserId,
  asWorkspaceId,
} from "../../shared/identifiers";
import { failure, success } from "../../shared/result";
import type { Result } from "../../shared/result";
import type { ContextBuildRequest } from "../contracts/context-build-request";
import type { ContextIdentity, ContextScope } from "../contracts/context-identity";
import type { ContextPolicy } from "../contracts/context-policy";
import type { IntelligenceContext } from "../contracts/intelligence-context";
import { ContextError } from "../errors";
import type {
  IAssetContextBuilder,
  IBrandContextBuilder,
  ICapabilityContextBuilder,
  IExecutionContextBuilder,
  IIntelligenceContextBuilder,
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

export interface IntelligenceContextBuilderDependencies {
  readonly organization: IOrganizationContextBuilder;
  readonly workspace: IWorkspaceContextBuilder;
  readonly project: IProjectContextBuilder;
  readonly requirement: IRequirementContextBuilder;
  readonly task: ITaskContextBuilder;
  readonly user: IUserContextBuilder;
  readonly role: IRoleContextBuilder;
  readonly capability: ICapabilityContextBuilder;
  readonly execution: IExecutionContextBuilder;
  readonly brand: IBrandContextBuilder;
  readonly assets: IAssetContextBuilder;
  readonly security: ISecurityContextBuilder;
  readonly language: ILanguageContextBuilder;
  readonly platform: IPlatformContextBuilder;
  readonly nowIso?: () => string;
  readonly createContextId?: () => string;
}

export class IntelligenceContextBuilder implements IIntelligenceContextBuilder {
  private readonly nowIso: () => string;
  private readonly createContextId: () => string;

  constructor(private readonly deps: IntelligenceContextBuilderDependencies) {
    this.nowIso = deps.nowIso ?? (() => new Date().toISOString());
    this.createContextId =
      deps.createContextId ?? (() => `ctx_${randomUUID()}`);
  }

  async build(
    request: ContextBuildRequest
  ): Promise<Result<IntelligenceContext>> {
    const identity = this.buildIdentity(request);
    const scope = this.buildScope(request);

    const [
      organization,
      workspace,
      project,
      requirement,
      task,
      user,
      role,
      capability,
      execution,
      brand,
      assets,
      security,
      languageBundle,
      platform,
    ] = await Promise.all([
      this.deps.organization.build(request),
      this.deps.workspace.build(request),
      this.deps.project.build(request),
      this.deps.requirement.build(request),
      this.deps.task.build(request),
      this.deps.user.build(request),
      this.deps.role.build(request),
      this.deps.capability.build(request),
      this.deps.execution.build(request),
      this.deps.brand.build(request),
      this.deps.assets.build(request),
      this.deps.security.build(request),
      this.deps.language.build(request),
      this.deps.platform.build(request),
    ]);

    const sections = [
      organization,
      workspace,
      project,
      requirement,
      task,
      user,
      role,
      capability,
      execution,
      brand,
      assets,
      security,
      languageBundle,
      platform,
    ];

    for (const section of sections) {
      if (!section.ok) {
        return failure(
          new ContextError("Failed to build context section", {
            cause: section.error,
          })
        );
      }
    }

    if (
      !organization.ok ||
      !workspace.ok ||
      !project.ok ||
      !requirement.ok ||
      !task.ok ||
      !user.ok ||
      !role.ok ||
      !capability.ok ||
      !execution.ok ||
      !brand.ok ||
      !assets.ok ||
      !security.ok ||
      !languageBundle.ok ||
      !platform.ok
    ) {
      return failure(new ContextError("Failed to build context section"));
    }

    const policies: ContextPolicy = {
      brandPolicy: request.attributes?.brandPolicyId
        ? { policyId: String(request.attributes.brandPolicyId) }
        : undefined,
      securityPolicy: request.attributes?.securityPolicyId
        ? { policyId: String(request.attributes.securityPolicyId) }
        : undefined,
      executionPolicy: request.attributes?.executionPolicyId
        ? { policyId: String(request.attributes.executionPolicyId) }
        : undefined,
      privacyPolicy: request.attributes?.privacyPolicyId
        ? { policyId: String(request.attributes.privacyPolicyId) }
        : undefined,
      compliancePolicy: request.attributes?.compliancePolicyId
        ? { policyId: String(request.attributes.compliancePolicyId) }
        : undefined,
      localizationPolicy: request.attributes?.localizationPolicyId
        ? { policyId: String(request.attributes.localizationPolicyId) }
        : undefined,
    };

    const now = this.nowIso();
    const context: IntelligenceContext = {
      metadata: {
        contextId: this.createContextId(),
        version: "1.0.0",
        createdAt: now,
        sources: [
          {
            kind: "request",
            resolvedAt: now,
          },
          {
            kind: "organization",
            sourceId: String(request.organizationId),
            resolvedAt: now,
          },
          {
            kind: "workspace",
            sourceId: String(request.workspaceId),
            resolvedAt: now,
          },
          {
            kind: "capability",
            sourceId: String(request.capabilityId),
            resolvedAt: now,
          },
        ],
      },
      identity,
      scope,
      organization: organization.value,
      workspace: workspace.value,
      project: project.value,
      requirement: requirement.value,
      task: task.value,
      user: user.value,
      role: role.value,
      capability: capability.value,
      execution: execution.value,
      brand: brand.value,
      assets: assets.value,
      policy: {
        brandPolicyId: policies.brandPolicy?.policyId,
        securityPolicyId: policies.securityPolicy?.policyId,
        executionPolicyId: policies.executionPolicy?.policyId,
        privacyPolicyId: policies.privacyPolicy?.policyId,
        compliancePolicyId: policies.compliancePolicy?.policyId,
        localizationPolicyId: policies.localizationPolicy?.policyId,
      },
      policies,
      security: security.value,
      language: languageBundle.value.language,
      locale: languageBundle.value.locale,
      timeZone: languageBundle.value.timeZone,
      platform: platform.value,
    };

    return success(context);
  }

  private buildIdentity(request: ContextBuildRequest): ContextIdentity {
    return {
      organizationId: asOrganizationId(String(request.organizationId)),
      workspaceId: asWorkspaceId(String(request.workspaceId)),
      userId: request.userId
        ? asUserId(String(request.userId))
        : undefined,
      actorType: request.actorType ?? "user",
      correlationId: request.correlationId,
    };
  }

  private buildScope(request: ContextBuildRequest): ContextScope {
    return {
      organizationId: asOrganizationId(String(request.organizationId)),
      workspaceId: asWorkspaceId(String(request.workspaceId)),
      projectId: request.projectId,
      requirementId: request.requirementId,
      taskId: request.taskId,
      capabilityId: asCapabilityId(String(request.capabilityId)),
      capabilityVersion: request.capabilityVersion,
    };
  }
}
