/**
 * Adapter platform factory.
 *
 * Purpose: Wire the adapter platform with sensible defaults + injection points.
 * Responsibilities: Compose registry, engine, diagnostics, lifecycle, validator.
 * Usage: The single entry point to construct the platform.
 * Future Extension: Config-driven wiring.
 */

import type { IProviderDiagnostics } from "../interfaces/validation";
import type { IAdapterValidator } from "../interfaces/validation";
import type { IAdapterLifecycleManager } from "../interfaces/lifecycle-streaming";
import type {
  IAdapterEventPublisher,
  IProviderAdapterEngine,
  IProviderAdapterRegistry,
} from "../interfaces/engine-registry";
import type {
  IRequestTranslator,
  IResponseTranslator,
} from "../interfaces/translators";
import { DefaultAdapterValidator } from "../validation/default-adapter-validator";
import { DefaultProviderDiagnostics } from "../diagnostics/default-provider-diagnostics";
import { InMemoryAdapterLifecycleManager } from "../lifecycle/in-memory-lifecycle-manager";
import { InMemoryProviderAdapterRegistry } from "../registry/in-memory-adapter-registry";
import { DefaultRequestTranslator } from "../requests/default-request-translator";
import { DefaultResponseTranslator } from "../responses/default-response-translator";
import { ProviderAdapterEngine } from "../engine/adapter-engine";
import { NoopAdapterEventPublisher } from "../engine/event-publisher";

export interface CreateAdapterPlatformDeps {
  readonly validator?: IAdapterValidator;
  readonly lifecycle?: IAdapterLifecycleManager;
  readonly requestTranslator?: IRequestTranslator;
  readonly responseTranslator?: IResponseTranslator;
  readonly diagnostics?: IProviderDiagnostics;
  readonly eventPublisher?: IAdapterEventPublisher;
  readonly nowIso?: () => string;
  readonly createId?: (prefix: string) => string;
}

export interface AdapterPlatform {
  readonly registry: IProviderAdapterRegistry;
  readonly engine: IProviderAdapterEngine;
  readonly diagnostics: IProviderDiagnostics;
  readonly lifecycle: IAdapterLifecycleManager;
  readonly validator: IAdapterValidator;
}

export function createAdapterPlatform(
  deps: CreateAdapterPlatformDeps = {}
): AdapterPlatform {
  const nowIso = deps.nowIso ?? (() => new Date().toISOString());
  const validator = deps.validator ?? new DefaultAdapterValidator();
  const lifecycle =
    deps.lifecycle ?? new InMemoryAdapterLifecycleManager(nowIso);
  const eventPublisher =
    deps.eventPublisher ?? new NoopAdapterEventPublisher();

  const registry = new InMemoryProviderAdapterRegistry(
    validator,
    lifecycle,
    eventPublisher
  );

  const requestTranslator =
    deps.requestTranslator ??
    new DefaultRequestTranslator(nowIso, deps.createId);
  const responseTranslator =
    deps.responseTranslator ?? new DefaultResponseTranslator();

  const engine = new ProviderAdapterEngine({
    registry,
    requestTranslator,
    responseTranslator,
  });

  const diagnostics =
    deps.diagnostics ?? new DefaultProviderDiagnostics(validator, nowIso);

  return { registry, engine, diagnostics, lifecycle, validator };
}
