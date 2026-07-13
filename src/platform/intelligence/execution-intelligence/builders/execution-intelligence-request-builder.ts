/**
 * Execution Intelligence request builder.
 */

import { asCapabilityId, type CapabilityId } from "../../shared/identifiers";
import type { IntelligenceContext } from "../../context/contracts/intelligence-context";
import type { KnowledgeSnapshot } from "../../knowledge/contracts/knowledge-models";
import type { CompiledPrompt } from "../../prompt-compiler/contracts/prompt-models";
import type {
  ExecutionIntelligencePreferences,
  ExecutionIntelligenceRequest,
} from "../contracts/request";

export class ExecutionIntelligenceRequestBuilder {
  private requestId = "";
  private capabilityId: CapabilityId = asCapabilityId("text.generate");
  private context!: IntelligenceContext;
  private knowledge!: KnowledgeSnapshot;
  private compiledPrompt!: CompiledPrompt;
  private preferences?: ExecutionIntelligencePreferences;
  private attributes?: Readonly<Record<string, unknown>>;

  static create(): ExecutionIntelligenceRequestBuilder {
    return new ExecutionIntelligenceRequestBuilder();
  }

  withRequestId(requestId: string): this {
    this.requestId = requestId;
    return this;
  }

  withCapabilityId(capabilityId: CapabilityId | string): this {
    this.capabilityId = asCapabilityId(String(capabilityId));
    return this;
  }

  withContext(context: IntelligenceContext): this {
    this.context = context;
    return this;
  }

  withKnowledge(knowledge: KnowledgeSnapshot): this {
    this.knowledge = knowledge;
    return this;
  }

  withCompiledPrompt(compiledPrompt: CompiledPrompt): this {
    this.compiledPrompt = compiledPrompt;
    return this;
  }

  withPreferences(preferences: ExecutionIntelligencePreferences): this {
    this.preferences = preferences;
    return this;
  }

  withAttributes(attributes: Readonly<Record<string, unknown>>): this {
    this.attributes = attributes;
    return this;
  }

  build(): ExecutionIntelligenceRequest {
    if (!this.requestId.trim()) {
      throw new Error("requestId is required");
    }
    if (!this.context) {
      throw new Error("context is required");
    }
    if (!this.knowledge) {
      throw new Error("knowledge is required");
    }
    if (!this.compiledPrompt) {
      throw new Error("compiledPrompt is required");
    }

    return Object.freeze({
      requestId: this.requestId,
      capabilityId: this.capabilityId,
      context: this.context,
      knowledge: this.knowledge,
      compiledPrompt: this.compiledPrompt,
      preferences: this.preferences,
      attributes: this.attributes,
    });
  }
}
