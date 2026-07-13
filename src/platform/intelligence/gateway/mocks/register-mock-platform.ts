/**
 * Registers mock capabilities and a mock provider for integration testing.
 */

import { CapabilityBuilder } from "../../capability-registry/implementations/capability-builder";
import type { ICapabilityRegistry } from "../../capability-registry/interfaces/capability-registry";
import { ProviderBuilder } from "../../providers/metadata/provider-builder";
import type { IProviderRegistry } from "../../providers/registry/provider-registry";
import { asProviderId } from "../../shared/identifiers";
import { MOCK_CAPABILITY_IDS } from "./mock-capability-handlers";

const MOCK_PROVIDER_ID = "mock-provider";

export function registerMockPlatformArtifacts(options: {
  readonly capabilityRegistry: ICapabilityRegistry;
  readonly providerRegistry: IProviderRegistry;
  readonly nowIso?: () => string;
}): void {
  const nowIso = options.nowIso ?? (() => new Date().toISOString());

  const provider = ProviderBuilder.create(nowIso)
    .withId(MOCK_PROVIDER_ID)
    .withVendor("unagency-mock")
    .withDisplayName("Mock Provider")
    .withVersion("1.0.0")
    .withStatus("active")
    .withModalities("text")
    .withCapabilities(...MOCK_CAPABILITY_IDS)
    .withRegions("global")
    .build();

  options.providerRegistry.registerProvider(provider);

  const providerId = asProviderId(MOCK_PROVIDER_ID);

  for (const id of MOCK_CAPABILITY_IDS) {
    const capability = CapabilityBuilder.create(nowIso)
      .withId(id)
      .withName(id)
      .withVersion("1.0.0")
      .withDescription(`Mock capability: ${id}`)
      .withCategory("mock", "integration")
      .withTags("mock", "integration")
      .withOwner("platform")
      .withStatus("published")
      .withModalities("text")
      .withInputSchema({ contentTypes: ["application/json"] })
      .withOutputSchema({ contentTypes: ["application/json"] })
      .withProviderCompatibility({
        compatibleProviderIds: [providerId],
      })
      .withDefaultProvider(providerId)
      .withTimeout(10_000)
      .build();

    options.capabilityRegistry.register(capability);
  }
}

export { MOCK_PROVIDER_ID };
