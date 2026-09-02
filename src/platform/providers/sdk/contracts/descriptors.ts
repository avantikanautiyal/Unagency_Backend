/**
 * SDK capability + descriptor contracts.
 *
 * Purpose: Describe what an SDK wrapper supports.
 * Responsibilities: Capability, model, and client descriptors.
 * Usage: Registry, diagnostics, health.
 * Future Extension: Fine-grained feature flags.
 */

import type { SdkVendor } from "./enums";
import type { SdkClientId } from "./identifiers";
import type { SdkAuthenticationKind } from "./enums";
import type { SdkVersion } from "./version";

export interface SdkCapability {
  readonly vendor: SdkVendor;
  readonly streaming: boolean;
  readonly functionCalling: boolean;
  readonly vision: boolean;
  readonly audio: boolean;
  readonly embeddings: boolean;
  readonly reasoning: boolean;
  readonly structuredOutput: boolean;
  readonly authenticationKinds: readonly SdkAuthenticationKind[];
}

export interface SdkModelDescriptor {
  readonly modelId: string;
  readonly displayName?: string;
  readonly contextWindow?: number;
  readonly modalities: readonly string[];
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface SdkClientDescriptor {
  readonly clientId: SdkClientId;
  readonly vendor: SdkVendor;
  readonly version: SdkVersion;
  readonly capability: SdkCapability;
  readonly models: readonly SdkModelDescriptor[];
  readonly metadata?: Readonly<Record<string, unknown>>;
}
