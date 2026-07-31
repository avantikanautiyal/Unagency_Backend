/**
 * Execution Context Resolver — constructs tenant-aware business context for intelligence pipeline.
 */

import { failure, success, type Result } from "../../intelligence/shared/result";
import { NotFoundError, AuthorizationError } from "../../intelligence/shared/errors";
import type { IBrandBrainEngine } from "../brand-brain/interfaces/brand-brain";
import type { IKnowledgeIntelligenceEngine } from "../knowledge-intelligence/interfaces/knowledge-intelligence";
import { sampleBrandBrain } from "../brand-brain/builders/sample-brand-brain";
import { buildContextBuildRequest } from "./build-context-build-request";
import type {
  ExecutionBusinessContext,
  ExecutionContextResolveInput,
  ResolvedExecutionContextBundle,
} from "./contracts/execution-context";
import { assertTenantOwnership } from "./providers/tenant-guard";
import type { IExecutionContextStores } from "./stores/execution-context-stores";

export interface ExecutionContextResolverDeps {
  readonly stores: IExecutionContextStores;
  readonly brandBrain: IBrandBrainEngine;
  readonly businessKnowledge: IKnowledgeIntelligenceEngine;
  readonly nowIso: () => string;
  readonly createId: (prefix: string) => string;
  readonly requireBrand?: boolean;
}

export class ExecutionContextResolver {
  constructor(private readonly deps: ExecutionContextResolverDeps) {}

  async resolve(
    input: ExecutionContextResolveInput
  ): Promise<Result<ResolvedExecutionContextBundle>> {
    const timings: Record<string, number> = {};
    const start = Date.now();

    const orgStart = Date.now();
    let organization = await this.deps.stores.getOrganization(
      input.identity.organizationId
    );
    if (!organization && this.deps.stores.ensurePrincipal) {
      await this.deps.stores.ensurePrincipal({
        organizationId: input.identity.organizationId,
        userId: input.identity.userId,
      });
      organization = await this.deps.stores.getOrganization(
        input.identity.organizationId
      );
    }
    if (!organization) {
      return failure(new NotFoundError("organization not found for execution context"));
    }
    timings.organization = Date.now() - orgStart;

    // Live Brand Brain bootstrap from organisation (not demo tenant) when brain missing.
    if ("ensureBrandBrainFromOrganization" in this.deps.stores) {
      await (
        this.deps.stores as {
          ensureBrandBrainFromOrganization?: (
            organizationId: string,
            name: string,
            industry?: string
          ) => Promise<void>;
        }
      ).ensureBrandBrainFromOrganization?.(
        organization.organizationId,
        organization.name
      );
    }

    const userStart = Date.now();
    let user = await this.deps.stores.getUser(input.identity.userId);
    if (!user && this.deps.stores.ensurePrincipal) {
      await this.deps.stores.ensurePrincipal({
        organizationId: input.identity.organizationId,
        userId: input.identity.userId,
      });
      user = await this.deps.stores.getUser(input.identity.userId);
    }
    if (!user) {
      return failure(new NotFoundError("user not found for execution context"));
    }
    const userTenant = assertTenantOwnership({
      organizationId: input.identity.organizationId,
      entityOrganizationId: user.organizationId,
      entityKind: "user",
      entityId: user.userId,
    });
    if (!userTenant.ok) return userTenant;
    timings.user = Date.now() - userStart;

    let brandContext: ExecutionBusinessContext["brand"];
    const brandStart = Date.now();
    if (input.scope?.brandId) {
      const brandResult = await this.resolveBrand(input);
      if (!brandResult.ok) return brandResult;
      brandContext = brandResult.value;
    } else {
      const brandResult = await this.resolveBrand(input);
      if (brandResult.ok) {
        brandContext = brandResult.value;
      } else if (this.deps.requireBrand) {
        return brandResult;
      }
    }
    timings.brand = Date.now() - brandStart;

    let projectContext: ExecutionBusinessContext["project"];
    if (input.scope?.projectId) {
      const projectStart = Date.now();
      const projectResult = await this.resolveProject(input, input.scope.projectId);
      if (!projectResult.ok) return projectResult;
      projectContext = projectResult.value;
      timings.project = Date.now() - projectStart;
    }

    let campaignContext: ExecutionBusinessContext["campaign"];
    if (input.scope?.campaignId) {
      const campaignStart = Date.now();
      const campaignResult = await this.resolveCampaign(input, input.scope.campaignId);
      if (!campaignResult.ok) return campaignResult;
      campaignContext = campaignResult.value;
      timings.campaign = Date.now() - campaignStart;
    }

    let clientContext: ExecutionBusinessContext["client"];
    if (input.scope?.clientId) {
      const client = await this.deps.stores.getUser(input.scope.clientId);
      if (!client) {
        return failure(new NotFoundError("client user not found"));
      }
      const clientTenant = assertTenantOwnership({
        organizationId: input.identity.organizationId,
        entityOrganizationId: client.organizationId,
        entityKind: "client",
        entityId: client.userId,
      });
      if (!clientTenant.ok) return clientTenant;
      clientContext = {
        clientId: client.userId,
        displayName: client.displayName,
        email: client.email,
      };
    }

    const contextSnapshotId = this.deps.createId("ctxsnap");

    const brandEnrichStart = Date.now();
    let brandEnrichment;
    let policyContext: ExecutionBusinessContext["policy"];
    if (brandContext) {
      await this.ensureBrandBrainDocument(input, brandContext);
      const enriched = await this.deps.brandBrain.enrich({
        organizationId: input.identity.organizationId,
        brandId: brandContext.brandId,
        capabilityId: input.capabilityId,
        campaignId: campaignContext?.campaignId,
        department: input.hints?.department,
        region: input.hints?.region,
      });
      if (enriched.ok) {
        brandEnrichment = enriched.value;
        policyContext = extractPolicyFromEnrichment(enriched.value);
      }
    }
    timings.brandBrain = Date.now() - brandEnrichStart;

    const business: ExecutionBusinessContext = {
      identity: input.identity,
      organization: {
        organizationId: organization.organizationId,
        name: organization.name,
        status: organization.status,
      },
      user: {
        userId: user.userId,
        email: user.email,
        displayName: user.displayName,
      },
      brand: brandContext,
      project: projectContext,
      campaign: campaignContext,
      client: clientContext,
      policy: policyContext,
      completeness: {
        organization: true,
        user: true,
        brand: Boolean(brandContext),
        project: Boolean(projectContext),
        campaign: Boolean(campaignContext),
        client: Boolean(clientContext),
        policy: Boolean(policyContext),
      },
    };

    const kiStart = Date.now();
    let businessKnowledge;
    const currentBrain = await this.deps.brandBrain.getCurrent(input.identity.organizationId);
    if (currentBrain.ok && currentBrain.value) {
      const synced = this.deps.businessKnowledge.syncFromBrandBrain({
        organizationId: input.identity.organizationId,
        document: currentBrain.value.document,
        brandBrainVersion: currentBrain.value.version,
        changelog: "execution context sync",
      });
      if (synced.ok) {
        const assembled = this.deps.businessKnowledge.assembleContext({
          organizationId: input.identity.organizationId,
          campaignId: campaignContext?.campaignId,
          capabilityId: input.capabilityId,
          department: input.hints?.department,
          region: input.hints?.region,
          market: input.hints?.region,
        });
        if (assembled.ok) {
          businessKnowledge = assembled.value;
        }
      }
    }
    timings.businessKnowledge = Date.now() - kiStart;

    const contextBuildRequest = buildContextBuildRequest({
      resolveInput: input,
      business,
      brandEnrichment,
      contextSnapshotId,
    });

    timings.total = Date.now() - start;

    return success({
      business,
      contextBuildRequest,
      brandEnrichment,
      businessKnowledge,
      trace: {
        contextSnapshotId,
        organizationId: input.identity.organizationId,
        userId: input.identity.userId,
        brandId: brandContext?.brandId,
        brandSnapshotId: brandEnrichment?.enrichmentId,
        brandBrainVersion: brandEnrichment?.brainVersion,
        knowledgeSnapshotId: businessKnowledge?.contextId,
        knowledgeGraphVersion: businessKnowledge?.graphVersion,
        projectId: projectContext?.projectId,
        campaignId: campaignContext?.campaignId,
        providerTimingsMs: timings,
        completeness: business.completeness,
      },
    });
  }

  private async resolveBrand(
    input: ExecutionContextResolveInput
  ): Promise<Result<NonNullable<ExecutionBusinessContext["brand"]>>> {
    const listed = await this.deps.stores.listBrandsForOrganization(
      input.identity.organizationId
    );
    const brandId = input.scope?.brandId ?? listed[0]?.brandId;

    if (!brandId) {
      return failure(new NotFoundError("brand not found for organization"));
    }

    const brand = await this.deps.stores.getBrand(brandId);
    if (!brand) {
      return failure(new NotFoundError(`brand ${brandId} not found`));
    }

    const tenant = assertTenantOwnership({
      organizationId: input.identity.organizationId,
      entityOrganizationId: brand.organizationId,
      entityKind: "brand",
      entityId: brand.brandId,
    });
    if (!tenant.ok) return tenant;

    return success({
      brandId: brand.brandId,
      name: brand.name,
      toneOfVoice: brand.toneOfVoice,
      visualIdentity: brand.visualIdentity,
      brandRules: brand.brandRules,
    });
  }

  private async resolveProject(
    input: ExecutionContextResolveInput,
    projectId: string
  ): Promise<Result<NonNullable<ExecutionBusinessContext["project"]>>> {
    const project = await this.deps.stores.getProject(projectId);
    if (!project) {
      return failure(new NotFoundError(`project ${projectId} not found`));
    }
    const tenant = assertTenantOwnership({
      organizationId: input.identity.organizationId,
      entityOrganizationId: project.organizationId,
      entityKind: "project",
      entityId: project.projectId,
    });
    if (!tenant.ok) return tenant;

    return success({
      projectId: project.projectId,
      name: project.name,
      brandId: project.brandId,
    });
  }

  private async resolveCampaign(
    input: ExecutionContextResolveInput,
    campaignId: string
  ): Promise<Result<NonNullable<ExecutionBusinessContext["campaign"]>>> {
    const campaign = await this.deps.stores.getCampaign(campaignId);
    if (!campaign) {
      return failure(new NotFoundError(`campaign ${campaignId} not found`));
    }
    const tenant = assertTenantOwnership({
      organizationId: input.identity.organizationId,
      entityOrganizationId: campaign.organizationId,
      entityKind: "campaign",
      entityId: campaign.campaignId,
    });
    if (!tenant.ok) return tenant;

    return success({
      campaignId: campaign.campaignId,
      name: campaign.name,
      objective: campaign.objective,
      channels: campaign.channels,
      brandId: campaign.brandId,
      projectId: campaign.projectId,
    });
  }

  private async ensureBrandBrainDocument(
    input: ExecutionContextResolveInput,
    brand: NonNullable<ExecutionBusinessContext["brand"]>
  ): Promise<void> {
    const current = await this.deps.brandBrain.getCurrent(input.identity.organizationId);
    if (current.ok && current.value) {
      return;
    }

    const org = await this.deps.stores.getOrganization(input.identity.organizationId);
    await this.deps.brandBrain.upsert({
      organizationId: input.identity.organizationId,
      document: sampleBrandBrain({
        organizationId: input.identity.organizationId,
        brandName: brand.name,
        industry: org?.name ?? "general",
        tone: brand.toneOfVoice ? [brand.toneOfVoice] : ["professional"],
        region: input.hints?.region ?? "global",
        competitor: "generic competitor",
      }),
      changelog: "seeded from brand profile for execution context",
      label: "execution-context-seed",
      createdBy: input.identity.userId,
    });
  }
}

function extractPolicyFromEnrichment(
  enrichment: import("../brand-brain/contracts").BrandBrainEnrichmentPackage
): ExecutionBusinessContext["policy"] {
  const rules = enrichment.facts
    .filter((f) => String(f.section) === "policies" || String(f.section) === "content_preferences")
    .flatMap((f) => {
      if (typeof f.value === "string") return [f.value];
      if (Array.isArray(f.value)) return [...f.value];
      if (f.value && typeof f.value === "object" && "rules" in f.value) {
        return [...((f.value as { rules?: readonly string[] }).rules ?? [])];
      }
      return [];
    });

  if (rules.length === 0) return undefined;

  return {
    policyIds: [],
    rules,
    constraints: rules,
  };
}
