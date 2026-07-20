/**
 * Production Validation request builder.
 */

import type { ProductionValidationRequest } from "../contracts/result";
import type { ProductionExecutionMode } from "../contracts/enums";
import type { ProductionScenario } from "../contracts/scenario";

export class ProductionValidationRequestBuilder {
  private requestId = "";
  private scenarioId?: string;
  private scenario?: ProductionScenario;
  private correlationId?: string;
  private mode?: ProductionExecutionMode;
  private organizationId?: string;
  private workspaceId?: string;
  private budgetLimit?: number;
  private tokenBudgetLimit?: number;
  private metadata?: Record<string, unknown>;

  static create(): ProductionValidationRequestBuilder {
    return new ProductionValidationRequestBuilder();
  }

  withRequestId(id: string): this {
    this.requestId = id;
    return this;
  }

  withScenarioId(id: string): this {
    this.scenarioId = id;
    return this;
  }

  withScenario(scenario: ProductionScenario): this {
    this.scenario = scenario;
    return this;
  }

  withCorrelationId(id: string): this {
    this.correlationId = id;
    return this;
  }

  withMode(mode: ProductionExecutionMode): this {
    this.mode = mode;
    return this;
  }

  withOrganizationId(id: string): this {
    this.organizationId = id;
    return this;
  }

  withWorkspaceId(id: string): this {
    this.workspaceId = id;
    return this;
  }

  withBudgetLimit(n: number): this {
    this.budgetLimit = n;
    return this;
  }

  withTokenBudgetLimit(n: number): this {
    this.tokenBudgetLimit = n;
    return this;
  }

  withMetadata(metadata: Record<string, unknown>): this {
    this.metadata = metadata;
    return this;
  }

  build(): ProductionValidationRequest {
    return {
      requestId: this.requestId,
      scenarioId: this.scenarioId,
      scenario: this.scenario,
      correlationId: this.correlationId,
      mode: this.mode,
      organizationId: this.organizationId,
      workspaceId: this.workspaceId,
      budgetLimit: this.budgetLimit,
      tokenBudgetLimit: this.tokenBudgetLimit,
      metadata: this.metadata,
    };
  }
}
