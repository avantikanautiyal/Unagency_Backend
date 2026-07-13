/**
 * Platform kernel.
 *
 * Purpose: Operating-system kernel for the Intelligence Platform.
 * Responsibilities: Bootstrap, initialize, shutdown, module registry, status/version.
 * Usage: Obtained via bootstrapIntelligencePlatform(); do not construct directly outside CompositionRoot.
 * Future Extension: Dynamic module loaders, multi-tenant kernels.
 */

import type { IntelligencePlatformConfig } from "../../config";
import type { EventFactory, IEventBus } from "../../events";
import { IntelligenceEventTypes } from "../../events";
import type {
  IAuditLogger,
  IAuthorizationPolicy,
  IDataClassifier,
  ITrustGate,
} from "../../security";
import { KernelError } from "../../shared/errors";
import type { PlatformLifecyclePhase } from "../../shared/enums";
import { asModuleId } from "../../shared/identifiers";
import type { IClock } from "../../shared/interfaces";
import type { Result } from "../../shared/result";
import type { ITelemetry } from "../../telemetry";
import { FOUNDATION_MODULE_NAMES } from "../constants";
import type { IServiceContainer } from "../interfaces/di";
import type {
  IIntelligenceKernel,
  IPlatformKernel,
} from "../interfaces/kernel";
import type { ILifecycleManager } from "../interfaces/lifecycle";
import type { IHealthManager } from "../health/interfaces/health-manager";
import type { PlatformHealth } from "../health";
import type {
  PlatformInfo,
  PlatformMetadata,
  PlatformStatus,
  PlatformVersion,
} from "../metadata/platform-metadata";
import type { ModuleDescriptor } from "../registry/contracts/descriptors";
import type { IPlatformRegistries } from "../registry";

export class PlatformKernel implements IPlatformKernel, IIntelligenceKernel {
  private phase: PlatformLifecyclePhase = "created";
  private startedAt?: string;
  private initialized = false;

  constructor(
    readonly config: IntelligencePlatformConfig,
    readonly container: IServiceContainer,
    readonly lifecycle: ILifecycleManager,
    readonly healthManager: IHealthManager,
    readonly registries: IPlatformRegistries,
    readonly events: IEventBus,
    readonly telemetry: ITelemetry,
    readonly security: {
      readonly authorization: IAuthorizationPolicy;
      readonly audit: IAuditLogger;
      readonly classifier: IDataClassifier;
      readonly trustGate: ITrustGate;
    },
    private readonly eventFactory: EventFactory,
    private readonly clock: IClock
  ) {}

  /** @deprecated Prefer container */
  get services(): IServiceContainer {
    return this.container;
  }

  get metadata(): PlatformMetadata {
    return this.getMetadata();
  }

  async initialize(): Promise<void> {
    if (this.initialized && this.phase !== "stopped") {
      return;
    }

    if (this.phase === "stopped") {
      this.phase = "created";
      this.initialized = false;
    }

    this.phase = "bootstrapping";
    await this.lifecycle.initialize();
    this.initialized = true;
    this.telemetry.logger.info("intelligence.kernel.initialized");
  }

  async bootstrap(): Promise<void> {
    if (this.phase === "ready") {
      return;
    }

    if (this.phase !== "created" && this.phase !== "stopped" && this.phase !== "bootstrapping") {
      throw new KernelError("Kernel cannot bootstrap from current phase", {
        phase: this.phase,
      });
    }

    if (!this.initialized || this.phase === "stopped" || this.phase === "created") {
      await this.initialize();
    }

    this.registerFoundationModules();
    this.registerHealthChecks();

    const validation = this.registries.modules.validate();
    if (validation.ok && !validation.value.valid) {
      throw new KernelError("Module registry validation failed", {
        issues: validation.value.issues,
      });
    }

    await this.events.publish(
      this.eventFactory.create({
        type: IntelligenceEventTypes.PLATFORM_BOOTSTRAPPED,
        payload: {
          name: this.config.app.platformName,
          version: this.config.app.platformVersion,
        },
        metadata: { sourceModule: "kernel" },
      })
    );

    this.telemetry.logger.info("intelligence.kernel.bootstrapped", {
      name: this.config.app.platformName,
      version: this.config.app.platformVersion,
    });

    await this.start();
  }

  /**
   * Start lifecycle and mark platform ready (IIntelligenceKernel compat).
   */
  async start(): Promise<void> {
    if (this.phase === "ready") {
      return;
    }

    if (!this.initialized) {
      await this.initialize();
      this.registerFoundationModules();
      this.registerHealthChecks();
    }

    if (!this.config.app.enabled) {
      this.phase = "degraded";
      this.telemetry.logger.warn("intelligence.kernel.disabled");
      return;
    }

    await this.lifecycle.start();
    await this.lifecycle.ready();

    this.startedAt = this.clock.nowIso();
    this.phase = "ready";

    await this.events.publish(
      this.eventFactory.create({
        type: IntelligenceEventTypes.PLATFORM_READY,
        payload: { startedAt: this.startedAt },
        metadata: { sourceModule: "kernel" },
      })
    );

    this.telemetry.logger.info("intelligence.kernel.ready", {
      startedAt: this.startedAt,
    });
  }

  async shutdown(): Promise<void> {
    if (this.phase === "stopped" || this.phase === "shutting_down") {
      return;
    }

    this.phase = "shutting_down";

    await this.events.publish(
      this.eventFactory.create({
        type: IntelligenceEventTypes.PLATFORM_SHUTDOWN,
        payload: { shutdownAt: this.clock.nowIso() },
        metadata: { sourceModule: "kernel" },
      })
    );

    await this.lifecycle.stop();
    await this.lifecycle.dispose();

    this.healthManager.clear();
    this.registries.modules.clear();

    this.phase = "stopped";
    this.initialized = false;
    this.startedAt = undefined;
    this.telemetry.logger.info("intelligence.kernel.stopped");

    await this.container.dispose();
  }

  registerModule(descriptor: ModuleDescriptor): Result<void> {
    const result = this.registries.modules.register(descriptor);
    if (result.ok) {
      void this.events.publish(
        this.eventFactory.create({
          type: IntelligenceEventTypes.MODULE_REGISTERED,
          payload: { module: descriptor.name },
          metadata: { sourceModule: "kernel" },
        })
      );
    }
    return result;
  }

  unregisterModule(id: string): Result<void> {
    return this.registries.modules.unregister(id);
  }

  getModule(id: string): Result<ModuleDescriptor> {
    return this.registries.modules.resolve(id);
  }

  getStatus(): PlatformStatus {
    return {
      phase: this.phase,
      lifecyclePhase: this.lifecycle.phase,
      ready: this.isReady(),
      enabled: this.config.app.enabled,
    };
  }

  getVersion(): PlatformVersion {
    return {
      name: this.config.app.platformName,
      version: this.config.app.platformVersion,
    };
  }

  getInfo(): PlatformInfo {
    return {
      version: this.getVersion(),
      status: this.getStatus(),
      startedAt: this.startedAt,
      moduleCount: this.registries.modules.list().length,
    };
  }

  getMetadata(): PlatformMetadata {
    return {
      name: this.config.app.platformName,
      version: this.config.app.platformVersion,
      phase: this.phase,
      startedAt: this.startedAt,
    };
  }

  async health(): Promise<PlatformHealth> {
    return this.healthManager.runChecks();
  }

  isReady(): boolean {
    return this.phase === "ready";
  }

  private registerFoundationModules(): void {
    for (const name of FOUNDATION_MODULE_NAMES) {
      if (this.registries.modules.has(name)) {
        continue;
      }
      this.registerModule({
        id: asModuleId(name),
        name,
        version: this.config.app.platformVersion,
        status: "active",
      });
    }
  }

  private registerHealthChecks(): void {
    this.healthManager.registerCheck({
      name: "kernel",
      check: () => ({
        status: this.isReady()
          ? "healthy"
          : this.phase === "degraded"
            ? "degraded"
            : "unhealthy",
        message: `phase=${this.phase}`,
        details: { phase: this.phase, enabled: this.config.app.enabled },
      }),
    });

    this.healthManager.registerCheck({
      name: "config",
      check: () => ({
        status: "healthy",
        details: {
          env: this.config.app.env,
          version: this.config.app.platformVersion,
        },
      }),
    });

    this.healthManager.registerCheck({
      name: "modules",
      check: () => {
        const validation = this.registries.modules.validate();
        const valid = validation.ok && validation.value.valid;
        return {
          status: valid ? "healthy" : "unhealthy",
          details: {
            count: this.registries.modules.list().length,
            valid,
          },
        };
      },
    });
  }
}
