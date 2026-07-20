/**
 * Thin auth schema helpers for manifests.
 */

import type { ProviderAuthSchema } from "../contracts/manifest";
import type { AuthenticationType } from "../contracts/enums";

export function defaultApiKeyAuth(envVarHint = "PROVIDER_API_KEY"): ProviderAuthSchema {
  return {
    type: "api_key" satisfies AuthenticationType,
    headerName: "Authorization",
    envVarHint,
    supportsOrganization: false,
    supportsProject: false,
  };
}
