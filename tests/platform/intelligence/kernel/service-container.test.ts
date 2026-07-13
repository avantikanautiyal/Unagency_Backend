import {
  ServiceContainer,
} from "../../../../src/platform/intelligence/kernel/di/service-container";
import { createToken } from "../../../../src/platform/intelligence/kernel/interfaces/di";
import { KernelError } from "../../../../src/platform/intelligence/shared/errors";

describe("ServiceContainer", () => {
  it("resolves singleton instances", () => {
    const container = new ServiceContainer();
    const token = createToken<{ id: number }>("test.singleton");
    container.registerSingletonInstance(token, { id: 1 });

    expect(container.resolve(token)).toEqual({ id: 1 });
    expect(container.resolve(token)).toBe(container.resolve(token));
  });

  it("resolves singleton factories once", () => {
    const container = new ServiceContainer();
    const token = createToken<{ n: number }>("test.singletonFactory");
    let calls = 0;
    container.registerSingleton(token, () => {
      calls += 1;
      return { n: calls };
    });

    expect(container.resolve(token).n).toBe(1);
    expect(container.resolve(token).n).toBe(1);
    expect(calls).toBe(1);
  });

  it("resolves transient factories each time", () => {
    const container = new ServiceContainer();
    const token = createToken<{ n: number }>("test.transient");
    let calls = 0;
    container.registerTransient(token, () => {
      calls += 1;
      return { n: calls };
    });

    expect(container.resolve(token).n).toBe(1);
    expect(container.resolve(token).n).toBe(2);
    expect(calls).toBe(2);
  });

  it("detects circular dependencies", () => {
    const container = new ServiceContainer();
    const a = createToken<unknown>("a");
    const b = createToken<unknown>("b");

    container.registerSingleton(a, (resolver) => resolver.resolve(b));
    container.registerSingleton(b, (resolver) => resolver.resolve(a));

    expect(() => container.resolve(a)).toThrow(KernelError);
    expect(() => container.resolve(a)).toThrow(/Circular dependency/);
  });

  it("resolves scoped services within a scope", () => {
    const container = new ServiceContainer();
    const token = createToken<{ id: string }>("test.scoped");
    let calls = 0;
    container.registerScoped(token, () => {
      calls += 1;
      return { id: `scope-${calls}` };
    });

    const scope = container.createScope();
    const first = scope.resolve(token);
    const second = scope.resolve(token);
    expect(first).toBe(second);
    expect(calls).toBe(1);

    expect(() => container.resolve(token)).toThrow(/requires an active scope/);
  });

  it("disposes the container", async () => {
    const container = new ServiceContainer();
    const token = createToken<{ id: number }>("test.dispose");
    container.registerSingletonInstance(token, { id: 1 });

    await container.dispose();
    expect(() => container.resolve(token)).toThrow(/disposed/);
  });
});
