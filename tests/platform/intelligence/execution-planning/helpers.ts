import { CapabilityBuilder } from "../../../../src/platform/intelligence/capability-registry/implementations/capability-builder";
import { CapabilityRegistry } from "../../../../src/platform/intelligence/capability-registry/implementations/capability-registry";
import { ProviderBuilder } from "../../../../src/platform/intelligence/providers/metadata/provider-builder";
import { ProviderRegistry } from "../../../../src/platform/intelligence/providers/registry/provider-registry";
import { ProviderCapabilityMatrix } from "../../../../src/platform/intelligence/providers/capability-matrix/implementations/provider-capability-matrix";
import { InMemoryProviderHealthStore } from "../../../../src/platform/intelligence/providers/health/in-memory-provider-health-store";
import { createExecutionPlanningEngine } from "../../../../src/platform/intelligence/execution-planning/factories/create-planning-engine";
import { asCapabilityId, asOrganizationId, asProviderId, asWorkspaceId } from "../../../../src/platform/intelligence/shared/identifiers";
import type { IExecutionPlanningEngine } from "../../../../src/platform/intelligence/execution-planning/interfaces/execution-planning-engine";

export function createPlanningFixture(options?: {
  humanReview?: boolean;
}): {
  engine: IExecutionPlanningEngine;
  capabilityRegistry: CapabilityRegistry;
  providerRegistry: ProviderRegistry;
  matrix: ProviderCapabilityMatrix;
} {
  const capabilityRegistry = new CapabilityRegistry();
  const health = new InMemoryProviderHealthStore();
  const matrix = new ProviderCapabilityMatrix();
  const providerRegistry = new ProviderRegistry(health, matrix);

  const provider = ProviderBuilder.create(() => "2026-01-01T00:00:00.000Z")
    .withId("provider-a")
    .withVendor("example")
    .withDisplayName("Example Provider")
    .withVersion("1.0.0")
    .withStatus("active")
    .withModalities("text")
    .withCapabilities("analyzeBrief")
    .withStreamingSupport(true)
    .build();
  providerRegistry.registerProvider(provider);

  const capability = CapabilityBuilder.create(() => "2026-01-01T00:00:00.000Z")
    .withId("analyzeBrief")
    .withName("analyzeBrief")
    .withVersion("1.0.0")
    .withDescription("Analyze brief")
    .withCategory("requirements")
    .withOwner("platform")
    .withModalities("text")
    .withInputSchema({ contentTypes: ["text/plain"] })
    .withOutputSchema({ contentTypes: ["application/json"] })
    .withProviderCompatibility({
      compatibleProviderIds: [asProviderId("provider-a")],
    })
    .withDefaultProvider("provider-a")
    .withStatus("published")
    .withHumanReview({
      required: options?.humanReview ?? false,
      reason: options?.humanReview ? "quality" : undefined,
    })
    .withTimeout(30_000)
    .build();
  capabilityRegistry.register(capability);

  const engine = createExecutionPlanningEngine({
    capabilityRegistry,
    providerRegistry,
    providerCapabilityMatrix: matrix,
  });

  return { engine, capabilityRegistry, providerRegistry, matrix };
}

export function sampleRequest() {
  return {
    capabilityId: asCapabilityId("analyzeBrief"),
    organizationId: asOrganizationId("org_1"),
    workspaceId: asWorkspaceId("ws_1"),
    correlationId: "corr_1",
  };
}
