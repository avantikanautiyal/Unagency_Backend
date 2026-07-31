/**
 * OpenAI-compatible text provider configuration — shared across compat leaves.
 */

import type { SdkVendor } from "../../sdk/contracts/enums";

export interface TextProviderAuthConfig {
  readonly apiKey?: string;
  readonly baseUrl?: string;
  readonly extraHeaders?: Readonly<Record<string, string>>;
}

export interface TextProviderConfig {
  readonly vendor: SdkVendor;
  readonly canonicalProviderId: string;
  readonly wireProviderId: string;
  readonly adapterId: string;
  readonly sdkClientId: string;
  readonly version: string;
  readonly baseUrl: string;
  readonly credentialEnvVar: string;
  readonly enableEnvVar: string;
  /** Wire model ids accepted by this provider (simulated discovery). */
  readonly seedWireModels: readonly string[];
  readonly protocol: "openai_compatible";
  readonly streamingCapable: boolean;
  readonly toolsCapable: boolean;
  readonly structuredOutputCapable: boolean;
}
