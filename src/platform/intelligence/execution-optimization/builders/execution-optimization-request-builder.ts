/**
 * Execution Optimization request builder.
 */

import { asCapabilityId, type CapabilityId } from "../../shared/identifiers";
import type { ExecutionOptimizationInputs } from "../contracts/inputs";
import type {
  ExecutionOptimizationPreferences,
  ExecutionOptimizationRequest,
} from "../contracts/request";

export class ExecutionOptimizationRequestBuilder {
  private requestId = "";
  private capabilityId: CapabilityId = asCapabilityId("text.generate");
  private inputs!: ExecutionOptimizationInputs;
  private preferences?: ExecutionOptimizationPreferences;
  private attributes?: Readonly<Record<string, unknown>>;

  static create(): ExecutionOptimizationRequestBuilder {
    return new ExecutionOptimizationRequestBuilder();
  }

  withRequestId(requestId: string): this {
    this.requestId = requestId;
    return this;
  }

  withCapabilityId(capabilityId: CapabilityId | string): this {
    this.capabilityId = asCapabilityId(String(capabilityId));
    return this;
  }

  withInputs(inputs: ExecutionOptimizationInputs): this {
    this.inputs = inputs;
    return this;
  }

  withPreferences(preferences: ExecutionOptimizationPreferences): this {
    this.preferences = preferences;
    return this;
  }

  withAttributes(attributes: Readonly<Record<string, unknown>>): this {
    this.attributes = attributes;
    return this;
  }

  build(): ExecutionOptimizationRequest {
    if (!this.requestId.trim()) throw new Error("requestId is required");
    if (!this.inputs) throw new Error("inputs are required");

    return Object.freeze({
      requestId: this.requestId,
      capabilityId: this.capabilityId,
      inputs: this.inputs,
      preferences: this.preferences,
      attributes: this.attributes,
    });
  }
}
