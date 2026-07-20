/**
 * Brand Brain request builders.
 */

import type { BrandBrainRetrievalQuery } from "../contracts";
import type { UpsertBrandBrainInput } from "../interfaces";
import type { BrandBrainDocument } from "../contracts";

export class BrandBrainUpsertBuilder {
  private organizationId = "";
  private document?: BrandBrainDocument;
  private changelog = "";
  private label?: string;
  private createdBy?: string;

  static create(): BrandBrainUpsertBuilder {
    return new BrandBrainUpsertBuilder();
  }

  withOrganization(organizationId: string): this {
    this.organizationId = organizationId;
    return this;
  }

  withDocument(document: BrandBrainDocument): this {
    this.document = document;
    return this;
  }

  withChangelog(changelog: string): this {
    this.changelog = changelog;
    return this;
  }

  withLabel(label: string): this {
    this.label = label;
    return this;
  }

  withCreatedBy(createdBy: string): this {
    this.createdBy = createdBy;
    return this;
  }

  build(): UpsertBrandBrainInput {
    if (!this.document) throw new Error("document required");
    return {
      organizationId: this.organizationId,
      document: this.document,
      changelog: this.changelog,
      label: this.label,
      createdBy: this.createdBy,
    };
  }
}

export class BrandBrainRetrievalBuilder {
  private query: Partial<BrandBrainRetrievalQuery> = {};

  static create(): BrandBrainRetrievalBuilder {
    return new BrandBrainRetrievalBuilder();
  }

  forOrganization(organizationId: string): this {
    this.query = { ...this.query, organizationId };
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

  withProduct(productId: string): this {
    this.query = { ...this.query, productId };
    return this;
  }

  build(): BrandBrainRetrievalQuery {
    if (!this.query.organizationId) throw new Error("organizationId required");
    return this.query as BrandBrainRetrievalQuery;
  }
}
