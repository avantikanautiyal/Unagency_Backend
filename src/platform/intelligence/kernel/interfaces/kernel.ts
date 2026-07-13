/**
 * Intelligence Platform kernel ports.
 *
 * Purpose: Define the public kernel surface for bootstrap and module lifecycle.
 * Responsibilities: PlatformKernel and legacy IIntelligenceKernel contracts.
 * Usage: Business code must not depend on kernel internals — only approved façades later.
 * Future Extension: Plugin loaders, multi-tenant kernels.
 */

import type { IntelligencePlatformConfig } from "../../config";
import type { IEventBus } from "../../events";
import type { ITelemetry } from "../../telemetry";
import type {
  IAuditLogger,
  IAuthorizationPolicy,
  IDataClassifier,
  ITrustGate,
} from "../../security";
import type { Result } from "../../shared/result";
import type { PlatformHealth } from "../health";
import type {
  PlatformInfo,
  PlatformMetadata,
  PlatformStatus,
  PlatformVersion,
} from "../metadata/platform-metadata";
import type { ModuleDescriptor } from "../registry/contracts/descriptors";
import type { IPlatformRegistries } from "../registry";
import type { IServiceContainer } from "./di";
import type { ILifecycleManager } from "./lifecycle";
import type { IHealthManager } from "../health/interfaces/health-manager";

export type {
  PlatformMetadata,
  PlatformVersion,
  PlatformStatus,
  PlatformInfo,
} from "../metadata/platform-metadata";

/**
 * Primary kernel contract for M1.1.
 *
 * Purpose: Own platform lifecycle and module registration.
 * Responsibilities: bootstrap, initialize, shutdown, module CRUD, status/version.
 * Usage: Obtained from bootstrapIntelligencePlatform().
 * Future Extension: Dynamic module loading, hot-reload.
 */
export interface IPlatformKernel {
  readonly config: IntelligencePlatformConfig;
  readonly container: IServiceContainer;
  readonly lifecycle: ILifecycleManager;
  readonly healthManager: IHealthManager;
  readonly registries: IPlatformRegistries;
  readonly events: IEventBus;
  readonly telemetry: ITelemetry;
  readonly security: {
    readonly authorization: IAuthorizationPolicy;
    readonly audit: IAuditLogger;
    readonly classifier: IDataClassifier;
    readonly trustGate: ITrustGate;
  };

  /** Prepare internal state and lifecycle (idempotent-safe). */
  initialize(): Promise<void>;

  /** Full platform bring-up: initialize, register foundation, start, ready. */
  bootstrap(): Promise<void>;

  /** Graceful stop, dispose, clear registry. */
  shutdown(): Promise<void>;

  registerModule(descriptor: ModuleDescriptor): Result<void>;
  unregisterModule(id: string): Result<void>;
  getModule(id: string): Result<ModuleDescriptor>;

  getStatus(): PlatformStatus;
  getVersion(): PlatformVersion;
  getInfo(): PlatformInfo;
  getMetadata(): PlatformMetadata;

  health(): Promise<PlatformHealth>;
  isReady(): boolean;
}

/**
 * Legacy kernel surface (M0). Implemented by PlatformKernel for compatibility.
 *
 * Purpose: Preserve prior bootstrap consumers.
 * Responsibilities: metadata, services, bootstrap/start/shutdown/health.
 * Usage: Prefer IPlatformKernel for new code.
 * Future Extension: Remove after callers migrate.
 */
export interface IIntelligenceKernel {
  readonly metadata: PlatformMetadata;
  readonly config: IntelligencePlatformConfig;
  readonly services: IServiceContainer;
  readonly registries: IPlatformRegistries;
  readonly events: IEventBus;
  readonly telemetry: ITelemetry;
  readonly security: {
    readonly authorization: IAuthorizationPolicy;
    readonly audit: IAuditLogger;
    readonly classifier: IDataClassifier;
    readonly trustGate: ITrustGate;
  };

  bootstrap(): Promise<void>;
  start(): Promise<void>;
  shutdown(): Promise<void>;
  health(): Promise<PlatformHealth>;
  isReady(): boolean;
}
