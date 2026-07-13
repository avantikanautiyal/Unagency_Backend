/**
 * Provider configuration placeholders for Milestone M1+.
 * No provider SDKs are loaded here.
 */

export interface ProvidersConfig {
  readonly defaultProviderId?: string;
  readonly enabledProviderIds: readonly string[];
}

export function loadProvidersConfig(): ProvidersConfig {
  const enabled = process.env.INTELLIGENCE_ENABLED_PROVIDERS ?? "";
  return {
    defaultProviderId: process.env.INTELLIGENCE_DEFAULT_PROVIDER_ID,
    enabledProviderIds: enabled
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value.length > 0),
  };
}
