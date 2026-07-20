/**
 * Control Plane request builder.
 */

import type { ControlPlaneRequest } from "../contracts/request";
import type { OrganizationId, WorkspaceId } from "../../shared/identifiers";

export class ControlPlaneRequestBuilder {
  private requestId = "";
  private rawPrompt = "";
  private scenarioHint?: string;
  private budgetLimit?: number;
  private tokenBudgetLimit?: number;
  private regionHint?: string;
  private organizationId?: OrganizationId;
  private workspaceId?: WorkspaceId;
  private mode?: import("../contracts/enums").ControlPlaneMode;

  static create(): ControlPlaneRequestBuilder {
    return new ControlPlaneRequestBuilder();
  }

  withRequestId(id: string): this {
    this.requestId = id;
    return this;
  }

  withRawPrompt(prompt: string): this {
    this.rawPrompt = prompt;
    return this;
  }

  withScenarioHint(hint: string): this {
    this.scenarioHint = hint;
    return this;
  }

  withBudgetLimit(limit: number): this {
    this.budgetLimit = limit;
    return this;
  }

  withTokenBudgetLimit(limit: number): this {
    this.tokenBudgetLimit = limit;
    return this;
  }

  withRegionHint(region: string): this {
    this.regionHint = region;
    return this;
  }

  withMode(mode: import("../contracts/enums").ControlPlaneMode): this {
    this.mode = mode;
    return this;
  }

  build(): ControlPlaneRequest {
    if (!this.requestId.trim()) throw new Error("requestId required");
    if (!this.rawPrompt.trim()) throw new Error("rawPrompt required");
    return Object.freeze({
      requestId: this.requestId,
      rawPrompt: this.rawPrompt,
      organizationId: this.organizationId,
      workspaceId: this.workspaceId,
      scenarioHint: this.scenarioHint,
      budgetLimit: this.budgetLimit,
      tokenBudgetLimit: this.tokenBudgetLimit,
      regionHint: this.regionHint,
      mode: this.mode,
    });
  }
}
