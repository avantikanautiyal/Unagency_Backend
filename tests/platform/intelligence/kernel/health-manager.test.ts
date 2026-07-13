import { HealthManager } from "../../../../src/platform/intelligence/kernel/health/implementations/health-manager";
import { SystemClock } from "../../../../src/platform/intelligence/shared/utils/system-clock";

describe("HealthManager", () => {
  it("registers and runs checks", async () => {
    const manager = new HealthManager(new SystemClock());

    manager.registerCheck({
      name: "ok",
      check: () => ({ status: "healthy", message: "ok" }),
    });
    manager.registerCheck({
      name: "bad",
      check: () => ({ status: "unhealthy", message: "bad" }),
    });

    const report = await manager.runChecks();
    expect(report.status).toBe("unhealthy");
    expect(report.checks.ok?.status).toBe("healthy");
    expect(report.checks.bad?.status).toBe("unhealthy");
  });

  it("returns overall status", async () => {
    const manager = new HealthManager(new SystemClock());
    manager.registerCheck({
      name: "degraded",
      check: () => ({ status: "degraded" }),
    });

    await expect(manager.overallStatus()).resolves.toBe("degraded");
  });

  it("clears checks", async () => {
    const manager = new HealthManager(new SystemClock());
    manager.registerCheck({
      name: "ok",
      check: () => ({ status: "healthy" }),
    });
    manager.clear();

    const report = await manager.runChecks();
    expect(report.status).toBe("healthy");
    expect(Object.keys(report.checks)).toHaveLength(0);
  });
});
