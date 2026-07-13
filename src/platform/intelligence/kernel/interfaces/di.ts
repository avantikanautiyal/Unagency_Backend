/**
 * Dependency injection ports for the Intelligence Kernel.
 *
 * Purpose: Provide constructor-injection without an external DI framework.
 * Responsibilities: Service registration and resolution contracts.
 * Usage: Composition Root registers services; modules resolve via IServiceResolver.
 * Future Extension: Interceptors, open generics, async factories.
 */

/**
 * Opaque typed service token.
 *
 * Purpose: Identify a service without leaking concrete types across modules.
 * Responsibilities: Carry a stable key for registration/resolution.
 * Usage: `const Tokens = { Clock: createToken<IClock>("intelligence.clock") }`
 * Future Extension: Metadata (tags, multi-bind).
 */
export interface ServiceToken<T> {
  readonly key: string;
  readonly __type?: T;
}

export function createToken<T>(key: string): ServiceToken<T> {
  return { key };
}

export type ServiceLifetime = "singleton" | "transient" | "scoped";

export type ServiceFactory<T> = (resolver: IServiceResolver) => T;

/**
 * Optional dispose contract for services owned by the container.
 *
 * Purpose: Allow graceful resource release on platform shutdown.
 * Responsibilities: Release handles held by a service instance.
 * Usage: Implement on services that own timers, connections, or buffers.
 * Future Extension: Async-only dispose pipeline with timeouts.
 */
export interface IDisposable {
  dispose(): void | Promise<void>;
}

/**
 * Service registration surface.
 *
 * Purpose: Register services with explicit lifetimes.
 * Responsibilities: Singleton, transient, and scoped registration.
 * Usage: Called only from the Composition Root.
 * Future Extension: Conditional registration, decoration.
 */
export interface IServiceRegistration {
  registerSingletonInstance<T>(token: ServiceToken<T>, instance: T): void;
  registerSingleton<T>(token: ServiceToken<T>, factory: ServiceFactory<T>): void;
  registerTransient<T>(token: ServiceToken<T>, factory: ServiceFactory<T>): void;
  /**
   * Scoped lifetime interface.
   * Instances are cached per scope created via IServiceContainer.createScope().
   */
  registerScoped<T>(token: ServiceToken<T>, factory: ServiceFactory<T>): void;
}

/**
 * Service resolution surface.
 *
 * Purpose: Resolve registered services by token.
 * Responsibilities: Typed resolve, optional resolve, existence checks.
 * Usage: Injected into factories; not used as a service locator in business code.
 * Future Extension: Resolve-all for multi-bind tokens.
 */
export interface IServiceResolver {
  resolve<T>(token: ServiceToken<T>): T;
  tryResolve<T>(token: ServiceToken<T>): T | undefined;
  has(token: ServiceToken<unknown>): boolean;
}

/**
 * Full service container.
 *
 * Purpose: Own registrations and resolution for the platform kernel.
 * Responsibilities: Registration, resolution, scopes, disposal.
 * Usage: Created by Composition Root; passed into PlatformKernel.
 * Future Extension: Child containers, module-level isolation.
 */
export interface IServiceContainer
  extends IServiceRegistration, IServiceResolver {
  createScope(): IServiceScope;
  dispose(): Promise<void>;
}

/**
 * Scoped resolution context.
 *
 * Purpose: Cache scoped services for a logical unit of work.
 * Responsibilities: Resolve scoped/singleton/transient within a scope; dispose scope.
 * Usage: Optional — available for future request-scoped work.
 * Future Extension: Async local storage binding.
 */
export interface IServiceScope extends IServiceResolver, IDisposable {
  dispose(): void | Promise<void>;
}

/**
 * @deprecated Prefer IServiceContainer. Kept for M0 compatibility.
 */
export interface IServiceRegistry {
  registerSingleton<T>(token: ServiceToken<T>, instance: T): void;
  registerFactory<T>(token: ServiceToken<T>, factory: ServiceFactory<T>): void;
}

/**
 * @deprecated Prefer IServiceContainer.
 */
export interface IServiceProvider extends IServiceRegistry, IServiceResolver {}

/**
 * Module loader port for future dynamic modules.
 *
 * Purpose: Load module packages during bootstrap.
 * Responsibilities: Async module load hook.
 * Usage: Reserved for plugin loading.
 * Future Extension: Hot-reload and versioned module packs.
 */
export interface IModuleLoader {
  load(): Promise<void>;
}
