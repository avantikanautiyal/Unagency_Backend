import { CapabilityValidator } from "../../../../src/platform/intelligence/capability-registry/implementations/capability-validator";
import { buildSampleCapability } from "./helpers";

describe("CapabilityValidator", () => {
  const validator = new CapabilityValidator();

  it("accepts a valid capability", () => {
    const result = validator.validate(buildSampleCapability());
    expect(result.ok).toBe(true);
  });

  it("rejects invalid version", () => {
    const capability = {
      ...buildSampleCapability(),
      version: "not-semver",
    };
    const result = validator.validate(capability);
    expect(result.ok).toBe(false);
  });

  it("rejects non-positive timeout", () => {
    const capability = {
      ...buildSampleCapability(),
      timeout: { timeoutMs: 0 },
    };
    const result = validator.validate(capability);
    expect(result.ok).toBe(false);
  });

  it("rejects default provider outside compatibility list", () => {
    const base = buildSampleCapability();
    const capability = {
      ...base,
      defaultProvider: "other" as typeof base.defaultProvider,
    };
    const result = validator.validate(capability);
    expect(result.ok).toBe(false);
  });
});
