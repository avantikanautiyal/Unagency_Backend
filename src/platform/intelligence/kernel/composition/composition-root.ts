/**
 * Composition root.
 *
 * Purpose: Sole place where concrete implementations are constructed and wired.
 * Responsibilities: Build ServiceContainer, register foundation services, create PlatformKernel.
 * Usage: Invoked by bootstrapIntelligencePlatform only.
 * Future Extension: Environment-specific composition profiles.
 */

import {
  loadIntelligencePlatformConfig,
  type IntelligencePlatformConfig,
} from "../../config";
import { EventFactory, InMemoryEventBus } from "../../events";
import {
  AllowAllAuthorizationPolicy,
  ConsoleAuditLogger,
  DefaultDataClassifier,
  DefaultTrustGate,
} from "../../security";
import { SystemClock, UuidGenerator } from "../../shared/utils";
import { ConsoleTelemetry } from "../../telemetry";
import { ServiceContainer } from "../di/service-container";
import { HealthManager } from "../health/implementations/health-manager";
import type { IServiceContainer } from "../interfaces/di";
import type { IPlatformKernel } from "../interfaces/kernel";
import { LifecycleManager } from "../lifecycle/lifecycle-manager";
import { PlatformKernel } from "../lifecycle/platform-kernel";
import { ModuleRegistry } from "../registry/implementations/module-registry";
import { PlatformRegistries } from "../registry/implementations/platform-registries";
import { Tokens } from "./tokens";

export interface CompositionOptions {
  readonly config?: IntelligencePlatformConfig;
}

export class CompositionRoot {
  /**
   * Wire all foundation dependencies via constructor injection.
   */
  compose(options: CompositionOptions = {}): IServiceContainer {
    const container = new ServiceContainer();
    const config = options.config ?? loadIntelligencePlatformConfig();

    const clock = new SystemClock();
    const idGenerator = new UuidGenerator();
    const eventBus = new InMemoryEventBus();
    const eventFactory = new EventFactory(idGenerator, clock);
    const moduleRegistry = new ModuleRegistry();
    const registries = new PlatformRegistries(moduleRegistry);
    const telemetry = new ConsoleTelemetry(config.telemetry);
    const authorization = new AllowAllAuthorizationPolicy();
    const audit = new ConsoleAuditLogger(telemetry.logger);
    const classifier = new DefaultDataClassifier(
      config.security.defaultClassification
    );
    const trustGate = new DefaultTrustGate(authorization);
    const healthManager = new HealthManager(clock);
    const lifecycle = new LifecycleManager(telemetry.logger);

    container.registerSingletonInstance(Tokens.Container, container);
    container.registerSingletonInstance(Tokens.Config, config);
    container.registerSingletonInstance(Tokens.Clock, clock);
    container.registerSingletonInstance(Tokens.IdGenerator, idGenerator);
    container.registerSingletonInstance(Tokens.EventBus, eventBus);
    container.registerSingletonInstance(Tokens.EventFactory, eventFactory);
    container.registerSingletonInstance(Tokens.ModuleRegistry, moduleRegistry);
    container.registerSingletonInstance(Tokens.Registries, registries);
    container.registerSingletonInstance(Tokens.Telemetry, telemetry);
    container.registerSingletonInstance(
      Tokens.AuthorizationPolicy,
      authorization
    );
    container.registerSingletonInstance(Tokens.AuditLogger, audit);
    container.registerSingletonInstance(Tokens.DataClassifier, classifier);
    container.registerSingletonInstance(Tokens.TrustGate, trustGate);
    container.registerSingletonInstance(Tokens.HealthManager, healthManager);
    container.registerSingletonInstance(Tokens.LifecycleManager, lifecycle);

    const kernel = new PlatformKernel(
      config,
      container,
      lifecycle,
      healthManager,
      registries,
      eventBus,
      telemetry,
      {
        authorization,
        audit,
        classifier,
        trustGate,
      },
      eventFactory,
      clock
    );

    container.registerSingletonInstance(Tokens.Kernel, kernel);
    return container;
  }

  createKernel(options: CompositionOptions = {}): IPlatformKernel {
    const container = this.compose(options);
    return container.resolve(Tokens.Kernel);
  }
}
