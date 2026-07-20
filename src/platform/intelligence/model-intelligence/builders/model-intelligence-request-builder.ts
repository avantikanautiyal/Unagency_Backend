/**
 * Model Intelligence request builder.
 */

import { asCapabilityId, type CapabilityId } from "../../shared/identifiers";
import type { DepartmentKind } from "../contracts/enums";
import type { ModelIntelligenceRequest } from "../contracts/recommendation";

export class ModelIntelligenceRequestBuilder {
  private requestId = "";
  private capabilityId: CapabilityId = asCapabilityId("text.generate");
  private department?: DepartmentKind;
  private taskDescription?: string;
  private budgetPerRequest?: number;
  private latencyTargetMs?: number;
  private qualityTarget?: number;
  private region?: string;
  private contextSize?: number;
  private expectedOutputTokens?: number;

  static create(): ModelIntelligenceRequestBuilder {
    return new ModelIntelligenceRequestBuilder();
  }

  withRequestId(id: string): this {
    this.requestId = id;
    return this;
  }

  withCapabilityId(id: CapabilityId | string): this {
    this.capabilityId = asCapabilityId(String(id));
    return this;
  }

  withDepartment(department: DepartmentKind): this {
    this.department = department;
    return this;
  }

  withTaskDescription(desc: string): this {
    this.taskDescription = desc;
    return this;
  }

  withBudget(budget: number): this {
    this.budgetPerRequest = budget;
    return this;
  }

  withLatencyTarget(ms: number): this {
    this.latencyTargetMs = ms;
    return this;
  }

  withQualityTarget(target: number): this {
    this.qualityTarget = target;
    return this;
  }

  withContextSize(size: number): this {
    this.contextSize = size;
    return this;
  }

  withExpectedOutputTokens(tokens: number): this {
    this.expectedOutputTokens = tokens;
    return this;
  }

  build(): ModelIntelligenceRequest {
    if (!this.requestId.trim()) throw new Error("requestId required");
    return Object.freeze({
      requestId: this.requestId,
      capabilityId: this.capabilityId,
      department: this.department,
      taskDescription: this.taskDescription,
      budgetPerRequest: this.budgetPerRequest,
      latencyTargetMs: this.latencyTargetMs,
      qualityTarget: this.qualityTarget,
      region: this.region,
      contextSize: this.contextSize,
      expectedOutputTokens: this.expectedOutputTokens,
    });
  }
}
