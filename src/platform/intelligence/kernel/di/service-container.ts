/**
 * In-process service container.
 *
 * Purpose: Constructor-injection container for the Intelligence Kernel.
 * Responsibilities: Singleton/transient/scoped registration, resolution, circular detection, dispose.
 * Usage: Created only by CompositionRoot.
 * Future Extension: Async factories, decoration, open generics.
 */

import { KernelError } from "../../shared/errors";
import type {
  IDisposable,
  IServiceContainer,
  IServiceProvider,
  IServiceScope,
  ServiceFactory,
  ServiceLifetime,
  ServiceToken,
} from "../interfaces/di";

interface Registration<T> {
  readonly lifetime: ServiceLifetime;
  readonly factory: ServiceFactory<T>;
  instance?: T;
}

function isDisposable(value: unknown): value is IDisposable {
  return (
    typeof value === "object" &&
    value !== null &&
    "dispose" in value &&
    typeof (value as IDisposable).dispose === "function"
  );
}

/**
 * Root service container implementation.
 */
export class ServiceContainer implements IServiceContainer, IServiceProvider {
  private readonly registrations = new Map<string, Registration<unknown>>();
  private readonly resolving = new Set<string>();
  private readonly disposables: IDisposable[] = [];
  private disposed = false;

  registerSingletonInstance<T>(token: ServiceToken<T>, instance: T): void {
    this.assertNotDisposed();
    this.registrations.set(token.key, {
      lifetime: "singleton",
      factory: () => instance,
      instance,
    });
    if (instance !== (this as unknown)) {
      this.trackDisposable(instance);
    }
  }

  /**
   * M0-compatible: register a singleton instance.
   */
  registerSingleton<T>(
    token: ServiceToken<T>,
    instanceOrFactory: T | ServiceFactory<T>
  ): void {
    this.assertNotDisposed();
    if (typeof instanceOrFactory === "function") {
      this.registrations.set(token.key, {
        lifetime: "singleton",
        factory: instanceOrFactory as ServiceFactory<T>,
      });
      return;
    }
    this.registerSingletonInstance(token, instanceOrFactory);
  }

  /**
   * M0-compatible alias for singleton factory registration.
   */
  registerFactory<T>(token: ServiceToken<T>, factory: ServiceFactory<T>): void {
    this.registerSingleton(token, factory);
  }

  registerTransient<T>(token: ServiceToken<T>, factory: ServiceFactory<T>): void {
    this.assertNotDisposed();
    this.registrations.set(token.key, {
      lifetime: "transient",
      factory,
    });
  }

  registerScoped<T>(token: ServiceToken<T>, factory: ServiceFactory<T>): void {
    this.assertNotDisposed();
    this.registrations.set(token.key, {
      lifetime: "scoped",
      factory,
    });
  }

  resolve<T>(token: ServiceToken<T>): T {
    const value = this.tryResolve(token);
    if (value === undefined) {
      throw new KernelError(`Service not registered: ${token.key}`);
    }
    return value;
  }

  tryResolve<T>(token: ServiceToken<T>): T | undefined {
    this.assertNotDisposed();
    return this.resolveInternal(token, this.registrations, undefined);
  }

  has(token: ServiceToken<unknown>): boolean {
    return this.registrations.has(token.key);
  }

  createScope(): IServiceScope {
    this.assertNotDisposed();
    return new ServiceScope(this);
  }

  async dispose(): Promise<void> {
    if (this.disposed) {
      return;
    }
    this.disposed = true;

    for (let i = this.disposables.length - 1; i >= 0; i -= 1) {
      const disposable = this.disposables[i];
      if (!disposable) continue;
      await disposable.dispose();
    }

    this.disposables.length = 0;
    this.registrations.clear();
    this.resolving.clear();
  }

  /** @internal Used by ServiceScope */
  resolveFromScope<T>(
    token: ServiceToken<T>,
    scopedCache: Map<string, unknown>
  ): T | undefined {
    return this.resolveInternal(token, this.registrations, scopedCache);
  }

  private resolveInternal<T>(
    token: ServiceToken<T>,
    registrations: Map<string, Registration<unknown>>,
    scopedCache: Map<string, unknown> | undefined
  ): T | undefined {
    const registration = registrations.get(token.key) as
      | Registration<T>
      | undefined;
    if (!registration) {
      return undefined;
    }

    if (registration.lifetime === "singleton" && registration.instance !== undefined) {
      return registration.instance;
    }

    if (registration.lifetime === "scoped" && scopedCache?.has(token.key)) {
      return scopedCache.get(token.key) as T;
    }

    if (this.resolving.has(token.key)) {
      const chain = [...this.resolving, token.key].join(" -> ");
      throw new KernelError("Circular dependency detected", { chain });
    }

    this.resolving.add(token.key);
    try {
      const instance = registration.factory(this);

      if (registration.lifetime === "singleton") {
        registration.instance = instance;
        this.trackDisposable(instance);
      } else if (registration.lifetime === "scoped") {
        if (!scopedCache) {
          throw new KernelError(
            `Scoped service '${token.key}' requires an active scope`
          );
        }
        scopedCache.set(token.key, instance);
      }

      return instance;
    } finally {
      this.resolving.delete(token.key);
    }
  }

  private trackDisposable(instance: unknown): void {
    if (isDisposable(instance)) {
      this.disposables.push(instance);
    }
  }

  private assertNotDisposed(): void {
    if (this.disposed) {
      throw new KernelError("Service container has been disposed");
    }
  }
}

class ServiceScope implements IServiceScope {
  private readonly cache = new Map<string, unknown>();
  private disposed = false;

  constructor(private readonly root: ServiceContainer) {}

  resolve<T>(token: ServiceToken<T>): T {
    const value = this.tryResolve(token);
    if (value === undefined) {
      throw new KernelError(`Service not registered: ${token.key}`);
    }
    return value;
  }

  tryResolve<T>(token: ServiceToken<T>): T | undefined {
    if (this.disposed) {
      throw new KernelError("Service scope has been disposed");
    }
    return this.root.resolveFromScope(token, this.cache);
  }

  has(token: ServiceToken<unknown>): boolean {
    return this.root.has(token);
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    this.cache.clear();
  }
}

/**
 * @deprecated Prefer ServiceContainer. Alias for compatibility.
 */
export class ServiceProvider extends ServiceContainer {}
