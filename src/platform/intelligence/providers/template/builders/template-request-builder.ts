/**
 * Template canonical request builder.
 */

import { asCapabilityId, asProviderId, type CapabilityId, type ProviderId } from "../../../shared/identifiers";
import { asTemplateRequestId } from "../contracts/identifiers";
import type { TemplateModality } from "../contracts/enums";
import type { TemplateCanonicalRequest } from "../contracts/request-response";

export class TemplateRequestBuilder {
  private requestId = "";
  private providerId: ProviderId = asProviderId("provider.template");
  private modelId = "template/model-alpha";
  private capabilityId?: CapabilityId;
  private modality: TemplateModality = "text";
  private input: Readonly<Record<string, unknown>> = {};
  private parameters: Readonly<Record<string, unknown>> = {};
  private features: string[] = [];
  private streaming = false;
  private timeoutMs = 30000;

  static create(): TemplateRequestBuilder {
    return new TemplateRequestBuilder();
  }

  withRequestId(id: string): this {
    this.requestId = id;
    return this;
  }

  withProviderId(id: ProviderId | string): this {
    this.providerId = asProviderId(String(id));
    return this;
  }

  withModelId(modelId: string): this {
    this.modelId = modelId;
    return this;
  }

  withCapabilityId(id: CapabilityId | string): this {
    this.capabilityId = asCapabilityId(String(id));
    return this;
  }

  withModality(modality: TemplateModality): this {
    this.modality = modality;
    return this;
  }

  withInput(input: Readonly<Record<string, unknown>>): this {
    this.input = input;
    return this;
  }

  withStreaming(streaming: boolean): this {
    this.streaming = streaming;
    return this;
  }

  build(): TemplateCanonicalRequest {
    if (!this.requestId.trim()) throw new Error("requestId required");
    return Object.freeze({
      requestId: asTemplateRequestId(this.requestId),
      providerId: this.providerId,
      modelId: this.modelId,
      capabilityId: this.capabilityId,
      modality: this.modality,
      input: this.input,
      parameters: this.parameters,
      features: this.features,
      streaming: this.streaming,
      timeoutMs: this.timeoutMs,
      metadata: {},
      createdAt: new Date().toISOString(),
    });
  }
}
