/**
 * Independent context section builders.
 */

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
import type { IntelligenceContext } from "../contracts/intelligence-context";

export interface IOrganizationContextBuilder {
  build(request: ContextBuildRequest): Promise<Result<OrganizationContextSection>>;
}

export interface IWorkspaceContextBuilder {
  build(request: ContextBuildRequest): Promise<Result<WorkspaceContextSection>>;
}

export interface IProjectContextBuilder {
  build(request: ContextBuildRequest): Promise<Result<ProjectContextSection>>;
}

export interface IRequirementContextBuilder {
  build(request: ContextBuildRequest): Promise<Result<RequirementContextSection>>;
}

export interface ITaskContextBuilder {
  build(request: ContextBuildRequest): Promise<Result<TaskContextSection>>;
}

export interface IUserContextBuilder {
  build(request: ContextBuildRequest): Promise<Result<UserContextSection>>;
}

export interface IBrandContextBuilder {
  build(request: ContextBuildRequest): Promise<Result<BrandContextSection>>;
}

export interface IExecutionContextBuilder {
  build(request: ContextBuildRequest): Promise<Result<ExecutionContextSection>>;
}

export interface IAssetContextBuilder {
  build(request: ContextBuildRequest): Promise<Result<AssetContextSection>>;
}

export interface ISecurityContextBuilder {
  build(request: ContextBuildRequest): Promise<Result<SecurityContextSection>>;
}

export interface ILanguageContextBuilder {
  build(request: ContextBuildRequest): Promise<Result<{
    language: LanguageContextSection;
    locale: LocaleContextSection;
    timeZone: TimeZoneContextSection;
  }>>;
}

export interface ICapabilityContextBuilder {
  build(request: ContextBuildRequest): Promise<Result<CapabilityContextSection>>;
}

export interface IRoleContextBuilder {
  build(request: ContextBuildRequest): Promise<Result<RoleContextSection>>;
}

export interface IPlatformContextBuilder {
  build(request: ContextBuildRequest): Promise<Result<PlatformContextSection>>;
}

export interface IIntelligenceContextBuilder {
  build(request: ContextBuildRequest): Promise<Result<IntelligenceContext>>;
}
