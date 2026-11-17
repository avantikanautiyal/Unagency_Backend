/**
 * OpenAI authentication helpers.
 */

import type { OpenAIAuthenticationConfig, OpenAIQuotaMetadata } from "../contracts/openai-contracts";
import type { SdkAuthentication } from "../../sdk/contracts/authentication";

export function toSdkAuthentication(config: OpenAIAuthenticationConfig): SdkAuthentication {
  return Object.freeze({
    kind: "api_key" as const,
    credentialRef: config.credentialRef ?? "openai.api_key",
    metadata: Object.freeze({
      hasApiKey: Boolean(config.apiKey),
      organizationId: config.organizationId,
      projectId: config.projectId,
    }),
  });
}

export function defaultQuotaMetadata(): OpenAIQuotaMetadata {
  return Object.freeze({
    requestsPerMinute: 500,
    tokensPerMinute: 200_000,
    requestsPerDay: 10_000,
  });
}

