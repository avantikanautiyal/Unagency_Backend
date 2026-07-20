/**
 * Versioning helpers — /v1 and /v2 future-compatible contracts.
 */

import type { ApiVersion } from "../contracts";

export const SUPPORTED_API_VERSIONS: readonly ApiVersion[] = ["v1", "v2"];

export function isSupportedVersion(v: string): v is ApiVersion {
  return v === "v1" || v === "v2";
}
