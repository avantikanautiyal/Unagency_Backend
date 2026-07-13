/**
 * SDK request builder.
 *
 * Purpose: Ergonomic construction of immutable SdkRequest.
 * Responsibilities: Apply defaults; freeze output.
 * Usage: Adapters/tests build SDK requests for the engine.
 * Future Extension: Transport bridge helpers.
 */

import type { ProviderId } from "../../../shared/identifiers";
import type { ProviderWirePayload } from "../../adapters/contracts/adapter-io";
import type { SdkAuthentication } from "../contracts/authentication";
import type { SdkVendor } from "../contracts/enums";
import type { SdkRetryPolicy, SdkTimeoutPolicy } from "../contracts/policies";
import type { SdkRequest } from "../contracts/request-response";

export class SdkRequestBuilder {
  private requestId = "";
  private providerId?: ProviderId;
  private vendor: SdkVendor = "openai";
  private operation = "invoke";
  private payload: ProviderWirePayload = {};
  private streaming = false;
  private authentication?: SdkAuthentication;
  private retryPolicy?: SdkRetryPolicy;
  private timeoutPolicy?: SdkTimeoutPolicy;
  private headers: Record<string, string> = {};
  private metadata: Record<string, unknown> = {};
  private createdAt = new Date().toISOString();

  static create(): SdkRequestBuilder {
    return new SdkRequestBuilder();
  }

  withRequestId(id: string): this {
    this.requestId = id;
    return this;
  }
  withProviderId(id: ProviderId): this {
    this.providerId = id;
    return this;
  }
  withVendor(vendor: SdkVendor): this {
    this.vendor = vendor;
    return this;
  }
  withOperation(operation: string): this {
    this.operation = operation;
    return this;
  }
  withPayload(payload: ProviderWirePayload): this {
    this.payload = payload;
    return this;
  }
  withStreaming(streaming: boolean): this {
    this.streaming = streaming;
    return this;
  }
  withAuthentication(auth: SdkAuthentication): this {
    this.authentication = auth;
    return this;
  }
  withRetryPolicy(policy: SdkRetryPolicy): this {
    this.retryPolicy = policy;
    return this;
  }
  withTimeoutPolicy(policy: SdkTimeoutPolicy): this {
    this.timeoutPolicy = policy;
    return this;
  }
  withHeaders(headers: Record<string, string>): this {
    this.headers = { ...this.headers, ...headers };
    return this;
  }
  withMetadata(metadata: Record<string, unknown>): this {
    this.metadata = { ...this.metadata, ...metadata };
    return this;
  }
  withCreatedAt(createdAt: string): this {
    this.createdAt = createdAt;
    return this;
  }

  build(): SdkRequest {
    if (!this.requestId) {
      throw new Error("SdkRequest requires a requestId");
    }
    if (!this.providerId) {
      throw new Error("SdkRequest requires a providerId");
    }
    return Object.freeze({
      requestId: this.requestId,
      providerId: this.providerId,
      vendor: this.vendor,
      operation: this.operation,
      payload: Object.freeze({ ...this.payload }),
      streaming: this.streaming,
      authentication: this.authentication,
      retryPolicy: this.retryPolicy,
      timeoutPolicy: this.timeoutPolicy,
      headers: Object.freeze({ ...this.headers }),
      metadata: Object.freeze({ ...this.metadata }),
      createdAt: this.createdAt,
    });
  }
}
