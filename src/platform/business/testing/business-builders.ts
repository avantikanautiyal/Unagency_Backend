/**
 * Business Platform request builders.
 */

import type { CreateOrganizationInput, RequestExecutionInput } from "../interfaces";
import type { BusinessRole } from "../contracts";

export class BusinessOrganizationBuilder {
  private name = "";
  private ownerEmail = "";
  private ownerDisplayName = "";
  private organizationId?: string;
  private ownerUserId?: string;

  static create(): BusinessOrganizationBuilder {
    return new BusinessOrganizationBuilder();
  }

  withName(name: string): this {
    this.name = name;
    return this;
  }

  withOwner(email: string, displayName: string): this {
    this.ownerEmail = email;
    this.ownerDisplayName = displayName;
    return this;
  }

  withIds(organizationId: string, ownerUserId: string): this {
    this.organizationId = organizationId;
    this.ownerUserId = ownerUserId;
    return this;
  }

  build(): CreateOrganizationInput {
    return {
      name: this.name,
      ownerEmail: this.ownerEmail,
      ownerDisplayName: this.ownerDisplayName,
      organizationId: this.organizationId,
      ownerUserId: this.ownerUserId,
    };
  }
}

export class BusinessExecutionRequestBuilder {
  private organizationId = "";
  private workspaceId?: string;
  private requestedByUserId = "";
  private prompt = "";
  private gatewayAccessToken = "";
  private campaignId?: string;
  private brandId?: string;
  private workflowId?: string;

  static create(): BusinessExecutionRequestBuilder {
    return new BusinessExecutionRequestBuilder();
  }

  withOrganization(organizationId: string): this {
    this.organizationId = organizationId;
    return this;
  }

  withWorkspace(workspaceId: string): this {
    this.workspaceId = workspaceId;
    return this;
  }

  withUser(userId: string): this {
    this.requestedByUserId = userId;
    return this;
  }

  withPrompt(prompt: string): this {
    this.prompt = prompt;
    return this;
  }

  withGatewayToken(token: string): this {
    this.gatewayAccessToken = token;
    return this;
  }

  withCampaign(campaignId: string): this {
    this.campaignId = campaignId;
    return this;
  }

  withBrand(brandId: string): this {
    this.brandId = brandId;
    return this;
  }

  withWorkflow(workflowId: string): this {
    this.workflowId = workflowId;
    return this;
  }

  build(): RequestExecutionInput {
    return {
      organizationId: this.organizationId,
      workspaceId: this.workspaceId,
      requestedByUserId: this.requestedByUserId,
      prompt: this.prompt,
      gatewayAccessToken: this.gatewayAccessToken,
      campaignId: this.campaignId,
      brandId: this.brandId,
      workflowId: this.workflowId,
    };
  }
}

export type { BusinessRole };
