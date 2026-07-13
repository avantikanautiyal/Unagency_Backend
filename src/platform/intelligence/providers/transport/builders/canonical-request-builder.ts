/**
 * Canonical provider request builder.
 *
 * Purpose: Ergonomic construction of immutable CanonicalProviderRequest.
 * Responsibilities: Apply defaults; freeze output.
 * Usage: Adapters/tests build canonical requests for the transport engine.
 * Future Extension: Multipart payload helpers.
 */

import type { ProviderId } from "../../../shared/identifiers";
import type { ProviderWirePayload } from "../../adapters/contracts/adapter-io";
import type { CanonicalProviderRequest, TransportTarget } from "../contracts/canonical";
import type { CompressionAlgorithm, TransportProtocol } from "../contracts/enums";

export class CanonicalProviderRequestBuilder {
  private requestId = "";
  private providerId?: ProviderId;
  private protocol: TransportProtocol = "local";
  private target: TransportTarget = { operation: "invoke" };
  private payload: ProviderWirePayload = {};
  private headers: Record<string, string> = {};
  private streaming = false;
  private timeoutMs = 30_000;
  private compression: CompressionAlgorithm = "none";
  private metadata: Record<string, unknown> = {};
  private createdAt = new Date().toISOString();

  static create(): CanonicalProviderRequestBuilder {
    return new CanonicalProviderRequestBuilder();
  }

  withRequestId(id: string): this {
    this.requestId = id;
    return this;
  }
  withProviderId(id: ProviderId): this {
    this.providerId = id;
    return this;
  }
  withProtocol(protocol: TransportProtocol): this {
    this.protocol = protocol;
    return this;
  }
  withTarget(target: TransportTarget): this {
    this.target = target;
    return this;
  }
  withOperation(operation: string): this {
    this.target = { ...this.target, operation };
    return this;
  }
  withPayload(payload: ProviderWirePayload): this {
    this.payload = payload;
    return this;
  }
  withHeaders(headers: Record<string, string>): this {
    this.headers = { ...this.headers, ...headers };
    return this;
  }
  withStreaming(streaming: boolean): this {
    this.streaming = streaming;
    return this;
  }
  withTimeout(timeoutMs: number): this {
    this.timeoutMs = timeoutMs;
    return this;
  }
  withCompression(compression: CompressionAlgorithm): this {
    this.compression = compression;
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

  build(): CanonicalProviderRequest {
    if (!this.requestId) {
      throw new Error("CanonicalProviderRequest requires a requestId");
    }
    if (!this.providerId) {
      throw new Error("CanonicalProviderRequest requires a providerId");
    }
    return Object.freeze({
      requestId: this.requestId,
      providerId: this.providerId,
      protocol: this.protocol,
      target: Object.freeze({ ...this.target }),
      payload: Object.freeze({ ...this.payload }),
      headers: Object.freeze({ ...this.headers }),
      streaming: this.streaming,
      timeoutMs: this.timeoutMs,
      compression: this.compression,
      metadata: Object.freeze({ ...this.metadata }),
      createdAt: this.createdAt,
    });
  }
}
