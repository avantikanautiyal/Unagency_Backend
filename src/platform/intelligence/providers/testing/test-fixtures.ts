/**
 * Provider platform test fixtures (no SDKs).
 */

import { ProviderBuilder } from "../metadata/provider-builder";
import type { ProviderDefinition } from "../metadata/provider-definition";

export function buildSampleProvider(
  overrides?: Partial<{ id: string; status: ProviderDefinition["status"] }>
): ProviderDefinition {
  return ProviderBuilder.create(() => "2026-01-01T00:00:00.000Z")
    .withId(overrides?.id ?? "provider-a")
    .withVendor("example-vendor")
    .withDisplayName("Example Provider")
    .withVersion("1.0.0")
    .withStatus(overrides?.status ?? "active")
    .withModalities("text", "image")
    .withCapabilities("analyzeBrief")
    .withRegions("us", "eu")
    .withStreamingSupport(true)
    .withVisionSupport(true)
    .withImageSupport(true)
    .withFunctionCallingSupport(true)
    .withEmbeddingsSupport(false)
    .build();
}
