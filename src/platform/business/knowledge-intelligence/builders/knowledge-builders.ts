/**
 * Fluent builders for Knowledge Intelligence inputs.
 */

import type { BrandBrainDocument } from "../../brand-brain/contracts";
import type { KnowledgeRetrievalQuery } from "../contracts";
import type { SyncFromBrandBrainInput } from "../interfaces";

export class KnowledgeSyncBuilder {
  private organizationId = "";
  private document?: BrandBrainDocument;
  private brandBrainVersion = 1;
  private changelog?: string;

  static create(): KnowledgeSyncBuilder {
    return new KnowledgeSyncBuilder();
  }

  withOrganization(organizationId: string): this {
    this.organizationId = organizationId;
    return this;
  }

  withDocument(document: BrandBrainDocument): this {
    this.document = document;
    return this;
  }

  withBrandBrainVersion(version: number): this {
    this.brandBrainVersion = version;
    return this;
  }

  withChangelog(changelog: string): this {
    this.changelog = changelog;
    return this;
  }

  build(): SyncFromBrandBrainInput {
    if (!this.document) throw new Error("document required");
    return {
      organizationId: this.organizationId || this.document.organizationId,
      document: this.document,
      brandBrainVersion: this.brandBrainVersion,
      changelog: this.changelog,
    };
  }
}

export class KnowledgeRetrievalBuilder {
  private query: Partial<KnowledgeRetrievalQuery> = {};

  static create(): KnowledgeRetrievalBuilder {
    return new KnowledgeRetrievalBuilder();
  }

  forOrganization(organizationId: string): this {
    this.query = { ...this.query, organizationId };
    return this;
  }

  withProduct(productId: string): this {
    this.query = { ...this.query, productId };
    return this;
  }

  withCampaign(campaignId: string): this {
    this.query = { ...this.query, campaignId };
    return this;
  }

  withAudience(audienceId: string): this {
    this.query = { ...this.query, audienceId };
    return this;
  }

  withRegion(region: string): this {
    this.query = { ...this.query, region };
    return this;
  }

  withCapability(capabilityId: string): this {
    this.query = { ...this.query, capabilityId };
    return this;
  }

  withDepartment(department: string): this {
    this.query = { ...this.query, department };
    return this;
  }

  withMaxDepth(maxDepth: number): this {
    this.query = { ...this.query, maxDepth };
    return this;
  }

  build(): KnowledgeRetrievalQuery {
    if (!this.query.organizationId) throw new Error("organizationId required");
    return this.query as KnowledgeRetrievalQuery;
  }
}
