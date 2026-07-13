import { asModuleId } from "../../../../src/platform/intelligence/shared/identifiers";
import { ModuleRegistry } from "../../../../src/platform/intelligence/kernel/registry/implementations/module-registry";

describe("ModuleRegistry", () => {
  let registry: ModuleRegistry;

  beforeEach(() => {
    registry = new ModuleRegistry();
  });

  it("registers and resolves a module", () => {
    const result = registry.register({
      id: asModuleId("kernel"),
      name: "kernel",
      version: "1.0.0",
      status: "active",
    });

    expect(result.ok).toBe(true);
    expect(registry.has("kernel")).toBe(true);

    const resolved = registry.resolve("kernel");
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.value.name).toBe("kernel");
    }
  });

  it("rejects duplicate registration", () => {
    registry.register({
      id: asModuleId("kernel"),
      name: "kernel",
      version: "1.0.0",
      status: "active",
    });

    const duplicate = registry.register({
      id: asModuleId("kernel"),
      name: "kernel",
      version: "1.0.0",
      status: "active",
    });

    expect(duplicate.ok).toBe(false);
  });

  it("unregisters a module", () => {
    registry.register({
      id: asModuleId("events"),
      name: "events",
      version: "1.0.0",
      status: "active",
    });

    const removed = registry.unregister("events");
    expect(removed.ok).toBe(true);
    expect(registry.has("events")).toBe(false);
  });

  it("validates missing dependencies", () => {
    registry.register({
      id: asModuleId("runtime"),
      name: "runtime",
      version: "1.0.0",
      status: "active",
      dependencies: [asModuleId("missing-module")],
    });

    const report = registry.validate();
    expect(report.ok).toBe(true);
    if (report.ok) {
      expect(report.value.valid).toBe(false);
      expect(report.value.issues[0]?.message).toContain("Missing dependency");
    }
  });

  it("validates circular dependencies", () => {
    registry.register({
      id: asModuleId("a"),
      name: "a",
      version: "1.0.0",
      status: "active",
      dependencies: [asModuleId("b")],
    });
    registry.register({
      id: asModuleId("b"),
      name: "b",
      version: "1.0.0",
      status: "active",
      dependencies: [asModuleId("a")],
    });

    const report = registry.validate();
    expect(report.ok).toBe(true);
    if (report.ok) {
      expect(report.value.valid).toBe(false);
      expect(
        report.value.issues.some((issue) =>
          issue.message.includes("Circular dependency")
        )
      ).toBe(true);
    }
  });

  it("clears all modules", () => {
    registry.register({
      id: asModuleId("kernel"),
      name: "kernel",
      version: "1.0.0",
      status: "active",
    });
    registry.clear();
    expect(registry.list()).toHaveLength(0);
  });
});
