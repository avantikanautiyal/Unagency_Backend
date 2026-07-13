import { CapabilityBuilder } from "../../../../src/platform/intelligence/capability-registry/implementations/capability-builder";
import type { CapabilityDefinition } from "../../../../src/platform/intelligence/capability-registry/contracts/capability-definition";
import { asProviderId } from "../../../../src/platform/intelligence/shared/identifiers";

export function buildSampleCapability(
  overrides?: Partial<{
    id: string;
    version: string;
    name: string;
    category: string;
    tags: string[];
    status: CapabilityDefinition["status"];
  }>
): CapabilityDefinition {
  const builder = CapabilityBuilder.create(() => "2026-01-01T00:00:00.000Z")
    .withId(overrides?.id ?? "analyzeBrief")
    .withName(overrides?.name ?? "analyzeBrief")
    .withVersion(overrides?.version ?? "1.0.0")
    .withDescription("Analyze a project brief")
    .withCategory(overrides?.category ?? "requirements", "analysis")
    .withTags(...(overrides?.tags ?? ["brief", "analysis"]))
    .withOwner("platform")
    .withModalities("text")
    .withInputSchema({ contentTypes: ["text/plain"] })
    .withOutputSchema({ contentTypes: ["application/json"] })
    .withProviderCompatibility({
      compatibleProviderIds: [asProviderId("provider-a")],
    })
    .withDefaultProvider("provider-a")
    .withTimeout(30_000)
    .withStatus(overrides?.status ?? "published");

  return builder.build();
}
