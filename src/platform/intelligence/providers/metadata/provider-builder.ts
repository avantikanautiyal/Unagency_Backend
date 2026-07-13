/**
 * Provider definition builder.
 *
 * Purpose: Construct ProviderDefinition without large constructors.
 * Responsibilities: Fluent setters and build().
 * Usage: ProviderBuilder.create().withId(...).build()
 * Future Extension: Template defaults per vendor family.
 */

import { asCapabilityId, asProviderId } from "../../shared/identifiers";
import type { CapabilityId, ProviderId } from "../../shared/identifiers";
import type {
  ProviderAuthenticationType,
  ProviderConcurrencyLimits,
  ProviderDefinition,
  ProviderModality,
  ProviderPricingModel,
  ProviderRateLimits,
  ProviderStatus,
  ProviderTimeoutLimits,
} from "./provider-definition";
import { ProviderVersion } from "../versioning/provider-version";
import { ProviderValidationError } from "../errors";

type Mutable<T> = { -readonly [K in keyof T]?: T[K] };

export class ProviderBuilder {
  private readonly draft: Mutable<ProviderDefinition> = {
    supportedModalities: [],
    supportedCapabilities: [],
    supportedRegions: [],
    status: "draft",
    authenticationType: "api_key",
    pricingModel: "unknown",
    concurrencyLimits: {},
    timeoutLimits: { defaultTimeoutMs: 60_000 },
    rateLimits: {},
    streamingSupport: false,
    functionCallingSupport: false,
    visionSupport: false,
    embeddingsSupport: false,
    imageSupport: false,
    audioSupport: false,
    videoSupport: false,
    metadata: {},
  };

  private constructor(private readonly nowIso: () => string) {}

  static create(nowIso: () => string = () => new Date().toISOString()): ProviderBuilder {
    return new ProviderBuilder(nowIso);
  }

  withId(id: ProviderId | string): this {
    this.draft.id = typeof id === "string" ? asProviderId(id) : id;
    return this;
  }

  withVendor(vendor: string): this {
    this.draft.vendor = vendor;
    return this;
  }

  withDisplayName(displayName: string): this {
    this.draft.displayName = displayName;
    return this;
  }

  withVersion(version: string): this {
    this.draft.version = version;
    return this;
  }

  withStatus(status: ProviderStatus): this {
    this.draft.status = status;
    return this;
  }

  withModalities(...modalities: ProviderModality[]): this {
    this.draft.supportedModalities = modalities;
    return this;
  }

  withCapabilities(...capabilityIds: Array<CapabilityId | string>): this {
    this.draft.supportedCapabilities = capabilityIds.map((id) =>
      typeof id === "string" ? asCapabilityId(id) : id
    );
    return this;
  }

  withRegions(...regions: string[]): this {
    this.draft.supportedRegions = regions;
    return this;
  }

  withAuthenticationType(authenticationType: ProviderAuthenticationType): this {
    this.draft.authenticationType = authenticationType;
    return this;
  }

  withPricingModel(pricingModel: ProviderPricingModel): this {
    this.draft.pricingModel = pricingModel;
    return this;
  }

  withConcurrencyLimits(limits: ProviderConcurrencyLimits): this {
    this.draft.concurrencyLimits = limits;
    return this;
  }

  withTimeoutLimits(limits: ProviderTimeoutLimits): this {
    this.draft.timeoutLimits = limits;
    return this;
  }

  withRateLimits(limits: ProviderRateLimits): this {
    this.draft.rateLimits = limits;
    return this;
  }

  withStreamingSupport(value: boolean): this {
    this.draft.streamingSupport = value;
    return this;
  }

  withFunctionCallingSupport(value: boolean): this {
    this.draft.functionCallingSupport = value;
    return this;
  }

  withVisionSupport(value: boolean): this {
    this.draft.visionSupport = value;
    return this;
  }

  withEmbeddingsSupport(value: boolean): this {
    this.draft.embeddingsSupport = value;
    return this;
  }

  withImageSupport(value: boolean): this {
    this.draft.imageSupport = value;
    return this;
  }

  withAudioSupport(value: boolean): this {
    this.draft.audioSupport = value;
    return this;
  }

  withVideoSupport(value: boolean): this {
    this.draft.videoSupport = value;
    return this;
  }

  withMetadata(metadata: Readonly<Record<string, unknown>>): this {
    this.draft.metadata = metadata;
    return this;
  }

  build(): ProviderDefinition {
    const now = this.nowIso();
    const version = this.draft.version ?? "1.0.0";
    if (!ProviderVersion.tryParse(version)) {
      throw new ProviderValidationError("Invalid provider version", { version });
    }

    const definition: ProviderDefinition = {
      id: this.draft.id as ProviderId,
      vendor: this.draft.vendor ?? "",
      displayName: this.draft.displayName ?? this.draft.vendor ?? "",
      version,
      status: this.draft.status ?? "draft",
      supportedModalities: this.draft.supportedModalities ?? [],
      supportedCapabilities: this.draft.supportedCapabilities ?? [],
      supportedRegions: this.draft.supportedRegions ?? [],
      authenticationType: this.draft.authenticationType ?? "api_key",
      pricingModel: this.draft.pricingModel ?? "unknown",
      concurrencyLimits: this.draft.concurrencyLimits ?? {},
      timeoutLimits: this.draft.timeoutLimits ?? { defaultTimeoutMs: 60_000 },
      rateLimits: this.draft.rateLimits ?? {},
      streamingSupport: this.draft.streamingSupport ?? false,
      functionCallingSupport: this.draft.functionCallingSupport ?? false,
      visionSupport: this.draft.visionSupport ?? false,
      embeddingsSupport: this.draft.embeddingsSupport ?? false,
      imageSupport: this.draft.imageSupport ?? false,
      audioSupport: this.draft.audioSupport ?? false,
      videoSupport: this.draft.videoSupport ?? false,
      metadata: this.draft.metadata ?? {},
      createdAt: this.draft.createdAt ?? now,
      updatedAt: now,
    };

    if (!definition.id || !definition.vendor.trim() || !definition.displayName.trim()) {
      throw new ProviderValidationError("Provider definition missing required fields", {
        id: definition.id,
        vendor: definition.vendor,
      });
    }

    if (definition.supportedModalities.length === 0) {
      throw new ProviderValidationError("supportedModalities must be non-empty");
    }

    if (definition.timeoutLimits.defaultTimeoutMs <= 0) {
      throw new ProviderValidationError("timeoutLimits.defaultTimeoutMs must be positive");
    }

    return definition;
  }
}
