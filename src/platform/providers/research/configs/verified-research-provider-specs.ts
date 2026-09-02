/**
 * Research / web-search provider specs — Exa + Tavily verified; others catalogued.
 */

export interface VerifiedResearchProviderSpec {
  readonly canonicalProviderId: string;
  readonly vendor: string;
  readonly displayName: string;
  readonly baseUrl: string;
  readonly credentialEnvVar: string;
  readonly enableEnvVar: string;
  readonly liveSmokeEnvVar: string;
  readonly vendorApiVerified: boolean;
  readonly blockedReason?: string;
  readonly inventoryModelId: string;
  readonly wireModelId: string;
  readonly searchPath: string;
}

export const EXA_RESEARCH_SPEC: VerifiedResearchProviderSpec = {
  canonicalProviderId: "provider.exa",
  vendor: "exa",
  displayName: "Exa",
  baseUrl: "https://api.exa.ai",
  credentialEnvVar: "EXA_API_KEY",
  enableEnvVar: "EXA_ENABLED",
  liveSmokeEnvVar: "RUN_LIVE_EXA_RESEARCH_SMOKE",
  vendorApiVerified: true,
  inventoryModelId: "exa-search",
  wireModelId: "exa-search",
  searchPath: "/search",
};

export const TAVILY_RESEARCH_SPEC: VerifiedResearchProviderSpec = {
  canonicalProviderId: "provider.tavily",
  vendor: "tavily",
  displayName: "Tavily",
  baseUrl: "https://api.tavily.com",
  credentialEnvVar: "TAVILY_API_KEY",
  enableEnvVar: "TAVILY_ENABLED",
  liveSmokeEnvVar: "RUN_LIVE_TAVILY_RESEARCH_SMOKE",
  vendorApiVerified: true,
  inventoryModelId: "tavily-search",
  wireModelId: "tavily-search",
  searchPath: "/search",
};

export const VERIFIED_RESEARCH_PROVIDER_SPECS: readonly VerifiedResearchProviderSpec[] = [
  EXA_RESEARCH_SPEC,
  TAVILY_RESEARCH_SPEC,
];

export const ALL_RESEARCH_PROVIDER_SPECS: readonly VerifiedResearchProviderSpec[] =
  VERIFIED_RESEARCH_PROVIDER_SPECS;
