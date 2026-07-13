/**
 * DI tokens for kernel composition.
 *
 * Purpose: Stable service identity for constructor injection.
 * Responsibilities: Export typed tokens for foundation services.
 * Usage: CompositionRoot registration and resolution only.
 * Future Extension: Module-specific token catalogs.
 */

import type { IntelligencePlatformConfig } from "../../config";
import type { IEventBus } from "../../events";
import type { EventFactory } from "../../events";
import type { IPlatformRegistries } from "../registry";
import type {
  IAuditLogger,
  IAuthorizationPolicy,
  IDataClassifier,
  ITrustGate,
} from "../../security";
import type { IClock, IIdGenerator } from "../../shared/interfaces";
import type { ITelemetry } from "../../telemetry";
import { createToken } from "../interfaces/di";
import type { IServiceContainer } from "../interfaces/di";
import type { IPlatformKernel } from "../interfaces/kernel";
import type { ILifecycleManager } from "../interfaces/lifecycle";
import type { IHealthManager } from "../health/interfaces/health-manager";
import type { IModuleRegistry } from "../registry";

export const Tokens = {
  Config: createToken<IntelligencePlatformConfig>("intelligence.config"),
  Clock: createToken<IClock>("intelligence.clock"),
  IdGenerator: createToken<IIdGenerator>("intelligence.idGenerator"),
  EventBus: createToken<IEventBus>("intelligence.eventBus"),
  EventFactory: createToken<EventFactory>("intelligence.eventFactory"),
  Registries: createToken<IPlatformRegistries>("intelligence.registries"),
  ModuleRegistry: createToken<IModuleRegistry>("intelligence.moduleRegistry"),
  Telemetry: createToken<ITelemetry>("intelligence.telemetry"),
  AuthorizationPolicy: createToken<IAuthorizationPolicy>(
    "intelligence.authorizationPolicy"
  ),
  AuditLogger: createToken<IAuditLogger>("intelligence.auditLogger"),
  DataClassifier: createToken<IDataClassifier>("intelligence.dataClassifier"),
  TrustGate: createToken<ITrustGate>("intelligence.trustGate"),
  HealthManager: createToken<IHealthManager>("intelligence.healthManager"),
  /** @deprecated Prefer HealthManager */
  HealthRegistry: createToken<IHealthManager>("intelligence.healthManager"),
  LifecycleManager: createToken<ILifecycleManager>(
    "intelligence.lifecycleManager"
  ),
  Container: createToken<IServiceContainer>("intelligence.container"),
  Kernel: createToken<IPlatformKernel>("intelligence.kernel"),
} as const;
