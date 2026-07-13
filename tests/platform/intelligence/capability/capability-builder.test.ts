import { CapabilityBuilder } from "../../../../src/platform/intelligence/capability-registry/implementations/capability-builder";
import { asProviderId } from "../../../../src/platform/intelligence/shared/identifiers";

describe("CapabilityBuilder", () => {
  it("builds a valid capability definition", () => {
    const capability = CapabilityBuilder.create(() => "2026-01-01T00:00:00.000Z")
      .withId("summarize")
      .withName("summarize")
      .withVersion("1.2.3")
      .withDescription("Summarize text")
      .withCategory("content")
      .withOwner("platform")
      .withModalities("text")
      .withInputSchema({ contentTypes: ["text/plain"] })
      .withOutputSchema({ contentTypes: ["text/plain"] })
      .withProviderCompatibility({
        compatibleProviderIds: [asProviderId("p1")],
      })
      .withDefaultProvider("p1")
      .withPolicies({
        executionPolicy: { policyId: "exec-default" },
      })
      .withTimeout(15_000)
      .withEvaluation({ enabled: true, sampleRate: 0.1 })
      .build();

    expect(capability.id).toBe("summarize");
    expect(capability.version).toBe("1.2.3");
    expect(capability.timeout.timeoutMs).toBe(15_000);
    expect(capability.policies.executionPolicy?.policyId).toBe("exec-default");
  });

  it("returns validation failure via tryBuild", () => {
    const result = CapabilityBuilder.create().withName("x").tryBuild();
    expect(result.ok).toBe(false);
  });
});
