import { CapabilityRegistry } from "../../../../src/platform/intelligence/capability-registry/implementations/capability-registry";
import { asCapabilityId } from "../../../../src/platform/intelligence/shared/identifiers";
import { buildSampleCapability } from "./helpers";

describe("CapabilityRegistry", () => {
  let registry: CapabilityRegistry;

  beforeEach(() => {
    registry = new CapabilityRegistry();
  });

  it("registers and resolves capabilities", () => {
    const capability = buildSampleCapability();
    const registered = registry.register(capability);
    expect(registered.ok).toBe(true);

    const resolved = registry.resolve(asCapabilityId("analyzeBrief"));
    expect(resolved.ok).toBe(true);
    expect(registry.exists(asCapabilityId("analyzeBrief"))).toBe(true);
  });

  it("rejects duplicate version registration", () => {
    const capability = buildSampleCapability();
    registry.register(capability);
    const duplicate = registry.register(capability);
    expect(duplicate.ok).toBe(false);
  });

  it("replaces an existing version with valid transition", () => {
    const capability = buildSampleCapability({ status: "published" });
    registry.register(capability);

    const replaced = registry.replace({
      ...capability,
      status: "deprecated",
      deprecatedAt: "2026-02-01T00:00:00.000Z",
      updatedAt: "2026-02-01T00:00:00.000Z",
    });
    expect(replaced.ok).toBe(true);
  });

  it("rejects invalid lifecycle transition on replace", () => {
    const capability = buildSampleCapability({ status: "archived" });
    registry.register(capability);

    const replaced = registry.replace({
      ...capability,
      status: "published",
      updatedAt: "2026-02-01T00:00:00.000Z",
    });
    expect(replaced.ok).toBe(false);
  });

  it("lists versions and resolves latest", () => {
    registry.register(buildSampleCapability({ version: "1.0.0" }));
    registry.register(buildSampleCapability({ version: "1.1.0" }));

    const versions = registry.listVersions(asCapabilityId("analyzeBrief"));
    expect(versions).toHaveLength(2);

    const latest = registry.resolve(asCapabilityId("analyzeBrief"), {
      channel: "latest",
    });
    expect(latest.ok).toBe(true);
    if (latest.ok) {
      expect(latest.value.version).toBe("1.1.0");
    }

    const version = registry.getVersion(asCapabilityId("analyzeBrief"), "latest");
    expect(version.ok).toBe(true);
    if (version.ok) {
      expect(version.value.toString()).toBe("1.1.0");
    }
  });

  it("unregisters and clears", () => {
    registry.register(buildSampleCapability());
    expect(registry.unregister(asCapabilityId("analyzeBrief")).ok).toBe(true);
    expect(registry.exists(asCapabilityId("analyzeBrief"))).toBe(false);

    registry.register(buildSampleCapability());
    registry.clear();
    expect(registry.list()).toHaveLength(0);
  });
});
