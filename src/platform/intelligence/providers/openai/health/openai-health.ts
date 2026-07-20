/**
 * Health + diagnostics helpers for OpenAI leaf.
 */

import { success, type Result } from "../../../shared/result";
import type { OpenAIProviderPlatform } from "../factories/create-openai-provider";

export interface OpenAIHealthReport {
  readonly status: string;
  readonly mode: string;
  readonly modelsCached: number;
  readonly certified: boolean;
  readonly certificationStatus?: string;
  readonly sdkHealthy: boolean;
  readonly checkedAt: string;
}

export function reportOpenAIHealth(
  platform: OpenAIProviderPlatform,
  nowIso: () => string = () => new Date().toISOString()
): Result<OpenAIHealthReport> {
  const sdk = platform.sdk.health();
  return success({
    status: platform.getStatus(),
    mode: platform.mode,
    modelsCached: platform.discovery.getCached().length,
    certified: platform.getStatus() === "active",
    certificationStatus: platform.certification?.status,
    sdkHealthy: sdk.ok && sdk.value.state === "healthy",
    checkedAt: nowIso(),
  });
}
