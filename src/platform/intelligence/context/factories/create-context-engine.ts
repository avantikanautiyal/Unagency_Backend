/**
 * Factory for ContextIntelligenceEngine with default builders/resolvers.
 */

import type { ICapabilityRegistry } from "../../capability-registry/interfaces/capability-registry";
import type { IntelligencePlatformConfig } from "../../config";
import {
  AssetContextBuilder,
  BrandContextBuilder,
  CapabilityContextBuilder,
  ExecutionContextBuilder,
  IntelligenceContextBuilder,
  LanguageContextBuilder,
  OrganizationContextBuilder,
  PlatformContextBuilder,
  ProjectContextBuilder,
  RequirementContextBuilder,
  RoleContextBuilder,
  SecurityContextBuilder,
  TaskContextBuilder,
  UserContextBuilder,
  WorkspaceContextBuilder,
} from "../builders";
import { ContextIntelligenceEngine } from "../engine/context-intelligence-engine";
import { createDefaultEnrichmentPipeline } from "../enrichment/enrichment-pipeline";
import type { IContextIntelligenceEngine } from "../interfaces/engine";
import { ContextNormalizer } from "../normalization/context-normalizer";
import {
  PlaceholderAssetResolver,
  PlaceholderBrandResolver,
  PlaceholderCapabilityResolver,
  PlaceholderOrganizationResolver,
  PlaceholderUserResolver,
  PlaceholderWorkspaceResolver,
} from "../resolvers/placeholder-resolvers";
import { ContextValidator } from "../validation/context-validator";

export interface CreateContextEngineOptions {
  readonly capabilityRegistry?: ICapabilityRegistry;
  readonly config?: IntelligencePlatformConfig;
}

export function createContextIntelligenceEngine(
  options: CreateContextEngineOptions = {}
): IContextIntelligenceEngine {
  const orgResolver = new PlaceholderOrganizationResolver();
  const workspaceResolver = new PlaceholderWorkspaceResolver();
  const userResolver = new PlaceholderUserResolver();
  const brandResolver = new PlaceholderBrandResolver();
  const assetResolver = new PlaceholderAssetResolver();
  const capabilityResolver = new PlaceholderCapabilityResolver();

  const builder = new IntelligenceContextBuilder({
    organization: new OrganizationContextBuilder(orgResolver),
    workspace: new WorkspaceContextBuilder(workspaceResolver),
    project: new ProjectContextBuilder(),
    requirement: new RequirementContextBuilder(),
    task: new TaskContextBuilder(),
    user: new UserContextBuilder(userResolver),
    role: new RoleContextBuilder(),
    capability: new CapabilityContextBuilder(
      capabilityResolver,
      options.capabilityRegistry
    ),
    execution: new ExecutionContextBuilder(),
    brand: new BrandContextBuilder(brandResolver),
    assets: new AssetContextBuilder(assetResolver),
    security: new SecurityContextBuilder(),
    language: new LanguageContextBuilder(),
    platform: new PlatformContextBuilder(
      options.config?.app.platformName,
      options.config?.app.platformVersion,
      options.config?.app.env
    ),
  });

  return new ContextIntelligenceEngine({
    builder,
    enrichment: createDefaultEnrichmentPipeline(),
    normalizer: new ContextNormalizer(),
    validator: new ContextValidator(),
  });
}
