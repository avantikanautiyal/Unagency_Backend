/**
 * Provider integration request builder.
 */

import type { ProviderId } from "../../../shared/identifiers";
import type { ProviderManifest } from "../../adapters/contracts/provider-manifest";
import type { IntegrationAction } from "../contracts/enums";
import type { ProviderIntegrationRequest } from "../contracts/request-result";

export class ProviderIntegrationRequestBuilder {
  private requestId = "";
  private action: IntegrationAction = "register";
  private providerId?: ProviderId;
  private manifest?: ProviderManifest;
  private targetVersion?: string;
  private metadata: Record<string, unknown> = {};
  private createdAt = new Date().toISOString();

  static create(): ProviderIntegrationRequestBuilder {
    return new ProviderIntegrationRequestBuilder();
  }

  withRequestId(id: string): this {
    this.requestId = id;
    return this;
  }
  withAction(action: IntegrationAction): this {
    this.action = action;
    return this;
  }
  withProviderId(id: ProviderId): this {
    this.providerId = id;
    return this;
  }
  withManifest(manifest: ProviderManifest): this {
    this.manifest = manifest;
    this.providerId = manifest.providerId;
    return this;
  }
  withTargetVersion(version: string): this {
    this.targetVersion = version;
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

  build(): ProviderIntegrationRequest {
    if (!this.requestId) {
      throw new Error("ProviderIntegrationRequest requires a requestId");
    }
    if (!this.manifest || !this.providerId) {
      throw new Error("ProviderIntegrationRequest requires a manifest");
    }
    return Object.freeze({
      requestId: this.requestId,
      action: this.action,
      providerId: this.providerId,
      manifest: this.manifest,
      targetVersion: this.targetVersion,
      metadata: Object.freeze({ ...this.metadata }),
      createdAt: this.createdAt,
    });
  }
}
