import { ProviderCapabilityMatrix } from "../../../../src/platform/intelligence/providers/capability-matrix/implementations/provider-capability-matrix";
import { deriveCapabilityProfile } from "../../../../src/platform/intelligence/providers/capability-matrix/derive-profile";
import { buildSampleProvider } from "../../../../src/platform/intelligence/providers/testing/test-fixtures";
import { asProviderId } from "../../../../src/platform/intelligence/shared/identifiers";

describe("ProviderCapabilityMatrix", () => {
  it("upserts and queries features", () => {
    const matrix = new ProviderCapabilityMatrix();
    const profile = deriveCapabilityProfile(buildSampleProvider());

    expect(matrix.upsert(profile).ok).toBe(true);
    expect(matrix.get(asProviderId("provider-a")).ok).toBe(true);
    expect(matrix.findByFeature("supportsVision")).toContainEqual(
      asProviderId("provider-a")
    );
    expect(
      matrix.findMatching({ supportsStreaming: true, supportsVision: true })
    ).toHaveLength(1);
  });

  it("removes profiles", () => {
    const matrix = new ProviderCapabilityMatrix();
    matrix.upsert(deriveCapabilityProfile(buildSampleProvider()));
    expect(matrix.remove(asProviderId("provider-a")).ok).toBe(true);
    expect(matrix.list()).toHaveLength(0);
  });
});
