/**
 * Provider model builder.
 *
 * Purpose: Ergonomically build immutable ProviderModel objects.
 * Responsibilities: Apply capability defaults; freeze output.
 * Usage: Used when constructing a manifest's models.
 * Future Extension: Per-model rate-limit configuration.
 */

import type { ProviderModality } from "../contracts/enums";
import type {
  ProviderModel,
  ProviderModelCapability,
} from "../contracts/provider-model";

const NO_CAPABILITY: ProviderModelCapability = {
  streaming: false,
  toolCalling: false,
  vision: false,
  audio: false,
  embeddings: false,
  reasoning: false,
  structuredOutputs: false,
  jsonMode: false,
};

export class ProviderModelBuilder {
  private _id?: string;
  private _displayName?: string;
  private _modalities: ProviderModality[] = ["text"];
  private _capability: ProviderModelCapability = NO_CAPABILITY;
  private _isDefault = false;
  private _deprecated = false;
  private _aliases: string[] = [];
  private _metadata: Record<string, unknown> = {};

  withId(id: string): this {
    this._id = id;
    return this;
  }
  withDisplayName(name: string): this {
    this._displayName = name;
    return this;
  }
  withModalities(modalities: readonly ProviderModality[]): this {
    this._modalities = [...modalities];
    return this;
  }
  withCapability(capability: Partial<ProviderModelCapability>): this {
    this._capability = { ...NO_CAPABILITY, ...capability };
    return this;
  }
  asDefault(isDefault = true): this {
    this._isDefault = isDefault;
    return this;
  }
  deprecated(deprecated = true): this {
    this._deprecated = deprecated;
    return this;
  }
  withAliases(aliases: readonly string[]): this {
    this._aliases = [...aliases];
    return this;
  }
  withMetadata(metadata: Readonly<Record<string, unknown>>): this {
    this._metadata = { ...metadata };
    return this;
  }

  build(): ProviderModel {
    if (!this._id) {
      throw new Error("ProviderModel requires an id");
    }
    return Object.freeze({
      id: this._id,
      displayName: this._displayName ?? this._id,
      modalities: Object.freeze([...this._modalities]),
      capability: Object.freeze({ ...this._capability }),
      isDefault: this._isDefault,
      deprecated: this._deprecated,
      aliases: Object.freeze([...this._aliases]),
      metadata: Object.freeze({ ...this._metadata }),
    });
  }
}
