import { setupModelRegistryPlatform } from "../../../../src/platform/intelligence/model-registry/testing";
import { DefaultCompatibilityEngine } from "../../../../src/platform/intelligence/model-registry/compatibility/default-compatibility-engine";

describe("Model Registry validation and pricing", () => {
  it("validates registry without issues", () => {
    const { validation } = setupModelRegistryPlatform();
    const issues = validation.validateRegistry();

    expect(issues.ok).toBe(true);
    if (!issues.ok) return;
    expect(issues.value).toHaveLength(0);
  });

  it("estimates pricing for a model", () => {
    const { registry, pricing } = setupModelRegistryPlatform();
    const model = registry.getModel("openai/gpt-4o-mini");

    expect(model.ok).toBe(true);
    if (!model.ok) return;
    const cost = pricing.estimateCost(model.value, 1000, 500);
    expect(cost.ok).toBe(true);
    if (!cost.ok) return;
    expect(cost.value).toBeGreaterThan(0);
  });

  it("checks capability compatibility", () => {
    const { registry } = setupModelRegistryPlatform();
    const compatibility = new DefaultCompatibilityEngine();
    const model = registry.getModel("openai/gpt-4o");

    expect(model.ok).toBe(true);
    if (!model.ok) return;
    const compatible = compatibility.isCompatible(model.value, "text.chat");
    expect(compatible.ok).toBe(true);
    if (!compatible.ok) return;
    expect(compatible.value).toBe(true);
  });
});
