/**
 * Provider manifest builder.
 *
 * Purpose: Ergonomically build immutable ProviderManifest objects.
 * Responsibilities: Apply defaults; derive coarse features from models; freeze.
 * Usage: The primary way to author a provider manifest.
 * Future Extension: Load manifests from config files (still no networking).
 */

import type { ProviderId } from "../../../shared/identifiers";
import type {
  ProviderAuthenticationType,
  ProviderLifecycleState,
  ProviderMaturity,
  ProviderModality,
} from "../contracts/enums";
import {
  manifestVersion,
  parseManifestVersion,
  type ProviderManifestVersion,
} from "../contracts/identifiers";
import type {
  ProviderManifest,
  ProviderManifestFeatures,
  ProviderRateLimitMetadata,
} from "../contracts/provider-manifest";
import type { ProviderModel } from "../contracts/provider-model";
import {
  NO_STREAMING_PROFILE,
  type ProviderStreamingProfile,
} from "../contracts/streaming-profile";

const NO_FEATURES: ProviderManifestFeatures = {
  streaming: false,
  toolCalling: false,
  vision: false,
  audio: false,
  embeddings: false,
  reasoning: false,
  structuredOutputs: false,
  jsonMode: false,
};

/**
 * Derive coarse manifest features from the union of model capabilities.
 */
function deriveFeatures(models: readonly ProviderModel[]): ProviderManifestFeatures {
  return models.reduce<ProviderManifestFeatures>(
    (acc, model) => ({
      streaming: acc.streaming || model.capability.streaming,
      toolCalling: acc.toolCalling || model.capability.toolCalling,
      vision: acc.vision || model.capability.vision,
      audio: acc.audio || model.capability.audio,
      embeddings: acc.embeddings || model.capability.embeddings,
      reasoning: acc.reasoning || model.capability.reasoning,
      structuredOutputs: acc.structuredOutputs || model.capability.structuredOutputs,
      jsonMode: acc.jsonMode || model.capability.jsonMode,
    }),
    { ...NO_FEATURES }
  );
}

export class ProviderManifestBuilder {
  private _providerId?: ProviderId;
  private _vendor?: string;
  private _displayName?: string;
  private _version: ProviderManifestVersion = manifestVersion(1, 0, 0);
  private _modalities: ProviderModality[] = ["text"];
  private _models: ProviderModel[] = [];
  private _defaultModels: Record<string, string> = {};
  private _capabilities: string[] = [];
  private _authTypes: ProviderAuthenticationType[] = ["api_key"];
  private _features?: ProviderManifestFeatures;
  private _streaming: ProviderStreamingProfile = NO_STREAMING_PROFILE;
  private _rateLimits: ProviderRateLimitMetadata = {};
  private _regions: string[] = [];
  private _status: ProviderLifecycleState = "registered";
  private _maturity: ProviderMaturity = "stable";
  private _metadata: Record<string, unknown> = {};
  private _createdAt?: string;
  private _updatedAt?: string;

  withProviderId(providerId: ProviderId): this {
    this._providerId = providerId;
    return this;
  }
  withVendor(vendor: string): this {
    this._vendor = vendor;
    return this;
  }
  withDisplayName(name: string): this {
    this._displayName = name;
    return this;
  }
  withVersion(version: string | ProviderManifestVersion): this {
    if (typeof version === "string") {
      const parsed = parseManifestVersion(version);
      if (!parsed) {
        throw new Error(`Invalid manifest version: ${version}`);
      }
      this._version = parsed;
    } else {
      this._version = version;
    }
    return this;
  }
  withModalities(modalities: readonly ProviderModality[]): this {
    this._modalities = [...modalities];
    return this;
  }
  withModels(models: readonly ProviderModel[]): this {
    this._models = [...models];
    return this;
  }
  addModel(model: ProviderModel): this {
    this._models.push(model);
    return this;
  }
  withDefaultModels(defaults: Readonly<Record<string, string>>): this {
    this._defaultModels = { ...defaults };
    return this;
  }
  withCapabilities(capabilities: readonly string[]): this {
    this._capabilities = [...capabilities];
    return this;
  }
  withAuthenticationTypes(types: readonly ProviderAuthenticationType[]): this {
    this._authTypes = [...types];
    return this;
  }
  withFeatures(features: ProviderManifestFeatures): this {
    this._features = features;
    return this;
  }
  withStreaming(streaming: ProviderStreamingProfile): this {
    this._streaming = streaming;
    return this;
  }
  withRateLimits(rateLimits: ProviderRateLimitMetadata): this {
    this._rateLimits = { ...rateLimits };
    return this;
  }
  withSupportedRegions(regions: readonly string[]): this {
    this._regions = [...regions];
    return this;
  }
  withStatus(status: ProviderLifecycleState): this {
    this._status = status;
    return this;
  }
  withMaturity(maturity: ProviderMaturity): this {
    this._maturity = maturity;
    return this;
  }
  withMetadata(metadata: Readonly<Record<string, unknown>>): this {
    this._metadata = { ...metadata };
    return this;
  }
  withTimestamps(createdAt: string, updatedAt: string): this {
    this._createdAt = createdAt;
    this._updatedAt = updatedAt;
    return this;
  }

  build(): ProviderManifest {
    if (!this._providerId) throw new Error("ProviderManifest requires a providerId");
    if (!this._vendor) throw new Error("ProviderManifest requires a vendor");

    const now = this._createdAt ?? new Date().toISOString();
    return Object.freeze({
      providerId: this._providerId,
      vendor: this._vendor,
      displayName: this._displayName ?? this._vendor,
      version: this._version,
      modalities: Object.freeze([...this._modalities]),
      models: Object.freeze([...this._models]),
      defaultModels: Object.freeze({ ...this._defaultModels }),
      capabilities: Object.freeze([...this._capabilities]),
      authenticationTypes: Object.freeze([...this._authTypes]),
      features: this._features ?? deriveFeatures(this._models),
      streaming: this._streaming,
      rateLimits: Object.freeze({ ...this._rateLimits }),
      supportedRegions: Object.freeze([...this._regions]),
      status: this._status,
      maturity: this._maturity,
      metadata: Object.freeze({ ...this._metadata }),
      createdAt: now,
      updatedAt: this._updatedAt ?? now,
    });
  }
}
