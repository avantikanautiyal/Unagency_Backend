import {
  bootstrapIntelligencePlatform,
  shutdownIntelligencePlatform,
} from "../../../../src/platform/intelligence/kernel/bootstrap/bootstrap";
import { asModuleId } from "../../../../src/platform/intelligence/shared/identifiers";

describe("PlatformKernel", () => {
  afterEach(async () => {
    await shutdownIntelligencePlatform();
  });

  it("bootstraps and reports ready status", async () => {
    const kernel = await bootstrapIntelligencePlatform();

    expect(kernel.isReady()).toBe(true);
    expect(kernel.getStatus().ready).toBe(true);
    expect(kernel.getVersion().version).toBeTruthy();
    expect(kernel.getInfo().moduleCount).toBeGreaterThan(0);

    const health = await kernel.health();
    expect(health.status).toBe("healthy");
  });

  it("registers and resolves modules", async () => {
    const kernel = await bootstrapIntelligencePlatform();

    const registered = kernel.registerModule({
      id: asModuleId("custom-module"),
      name: "custom-module",
      version: "1.0.0",
      status: "active",
    });
    expect(registered.ok).toBe(true);

    const resolved = kernel.getModule("custom-module");
    expect(resolved.ok).toBe(true);

    const removed = kernel.unregisterModule("custom-module");
    expect(removed.ok).toBe(true);
  });

  it("initializes without auto-start", async () => {
    const kernel = await bootstrapIntelligencePlatform({ autoStart: false });
    expect(kernel.isReady()).toBe(false);

    await kernel.bootstrap();
    expect(kernel.isReady()).toBe(true);
  });

  it("shuts down and clears modules", async () => {
    const kernel = await bootstrapIntelligencePlatform();
    expect(kernel.getInfo().moduleCount).toBeGreaterThan(0);

    await shutdownIntelligencePlatform();
    expect(kernel.getStatus().phase).toBe("stopped");
  });
});
