/**
 * Experience Intelligence request builder.
 */

import type { OrganizationId, WorkspaceId } from "../../shared/identifiers";
import type { ExperienceIntelligenceInputs } from "../contracts/inputs";
import type { ExperienceIntelligenceRequest } from "../contracts/request";

export class ExperienceIntelligenceRequestBuilder {
  private requestId = "";
  private inputs: ExperienceIntelligenceInputs = {};
  private organizationId?: OrganizationId;
  private workspaceId?: WorkspaceId;
  private batchSize?: number;

  static create(): ExperienceIntelligenceRequestBuilder {
    return new ExperienceIntelligenceRequestBuilder();
  }

  withRequestId(id: string): this {
    this.requestId = id;
    return this;
  }

  withInputs(inputs: ExperienceIntelligenceInputs): this {
    this.inputs = inputs;
    return this;
  }

  withBatchSize(size: number): this {
    this.batchSize = size;
    return this;
  }

  build(): ExperienceIntelligenceRequest {
    if (!this.requestId.trim()) throw new Error("requestId required");
    return Object.freeze({
      requestId: this.requestId,
      inputs: this.inputs,
      organizationId: this.organizationId,
      workspaceId: this.workspaceId,
      batchSize: this.batchSize,
    });
  }
}
