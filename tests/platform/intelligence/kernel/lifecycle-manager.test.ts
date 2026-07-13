import { LifecycleManager } from "../../../../src/platform/intelligence/kernel/lifecycle/lifecycle-manager";
import type { ILifecycle } from "../../../../src/platform/intelligence/kernel/interfaces/lifecycle";
import type { ILogger } from "../../../../src/platform/intelligence/shared/interfaces";

const silentLogger: ILogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

describe("LifecycleManager", () => {
  it("runs lifecycle phases in order", async () => {
    const manager = new LifecycleManager(silentLogger);
    const phases: string[] = [];

    const participant: ILifecycle = {
      name: "test",
      initialize: () => {
        phases.push("initialize");
      },
      start: () => {
        phases.push("start");
      },
      ready: () => {
        phases.push("ready");
      },
      stop: () => {
        phases.push("stop");
      },
      dispose: () => {
        phases.push("dispose");
      },
    };

    manager.register(participant);

    await manager.initialize();
    await manager.start();
    await manager.ready();
    await manager.stop();
    await manager.dispose();

    expect(phases).toEqual([
      "initialize",
      "start",
      "ready",
      "stop",
      "dispose",
    ]);
    expect(manager.phase).toBe("disposed");
  });

  it("rejects duplicate participant names", () => {
    const manager = new LifecycleManager(silentLogger);
    manager.register({ name: "dup" });
    expect(() => manager.register({ name: "dup" })).toThrow(
      /already registered/
    );
  });

  it("stops participants in reverse order", async () => {
    const manager = new LifecycleManager(silentLogger);
    const order: string[] = [];

    manager.register({
      name: "first",
      stop: () => {
        order.push("first");
      },
    });
    manager.register({
      name: "second",
      stop: () => {
        order.push("second");
      },
    });

    await manager.initialize();
    await manager.start();
    await manager.ready();
    await manager.stop();

    expect(order).toEqual(["second", "first"]);
  });
});
