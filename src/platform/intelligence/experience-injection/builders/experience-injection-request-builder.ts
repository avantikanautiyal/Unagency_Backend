/**
 * Experience Injection request builder.
 */

import type { ExperienceInjectionContext, ExperienceInjectionRequest } from "../contracts/request";
import type { InjectionMode, ConflictResolutionStrategy } from "../contracts/enums";
import type { StructuredTaskPlan } from "../../task-intelligence/contracts/planning";
import type { PromptMetadata } from "../../execution-optimization/contracts/inputs";

export class ExperienceInjectionRequestBuilder {
  private requestId = "";
  private context: ExperienceInjectionContext = {};
  private structuredTaskPlan?: StructuredTaskPlan;
  private promptMetadata?: PromptMetadata;
  private topN?: number;
  private maxContextItems?: number;
  private mode?: InjectionMode;
  private conflictStrategy?: ConflictResolutionStrategy;

  static create(): ExperienceInjectionRequestBuilder {
    return new ExperienceInjectionRequestBuilder();
  }

  withRequestId(id: string): this {
    this.requestId = id;
    return this;
  }

  withContext(context: ExperienceInjectionContext): this {
    this.context = context;
    return this;
  }

  withStructuredTaskPlan(plan: StructuredTaskPlan): this {
    this.structuredTaskPlan = plan;
    return this;
  }

  withPromptMetadata(meta: PromptMetadata): this {
    this.promptMetadata = meta;
    return this;
  }

  withTopN(n: number): this {
    this.topN = n;
    return this;
  }

  withMaxContextItems(n: number): this {
    this.maxContextItems = n;
    return this;
  }

  withMode(mode: InjectionMode): this {
    this.mode = mode;
    return this;
  }

  withConflictStrategy(strategy: ConflictResolutionStrategy): this {
    this.conflictStrategy = strategy;
    return this;
  }

  build(): ExperienceInjectionRequest {
    if (!this.requestId.trim()) throw new Error("requestId required");
    return Object.freeze({
      requestId: this.requestId,
      context: this.context,
      structuredTaskPlan: this.structuredTaskPlan,
      promptMetadata: this.promptMetadata,
      topN: this.topN,
      maxContextItems: this.maxContextItems,
      mode: this.mode,
      conflictStrategy: this.conflictStrategy,
    });
  }
}
