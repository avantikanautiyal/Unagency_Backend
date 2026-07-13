/**
 * Default integration health monitor.
 *
 * Purpose: Aggregate health across registry, manifest, compatibility, sync, lifecycle.
 * Responsibilities: Record subsystem checks; produce aggregate health.
 * Usage: Injected into integration engine.
 * Future Extension: Weighted health scoring.
 */

import type { ProviderIntegrationHealth } from "../contracts/health-registration";
import type { IProviderIntegrationHealthMonitor } from "../interfaces/engine";

interface Checks {
  registry: boolean;
  manifest: boolean;
  compatibility: boolean;
  synchronization: boolean;
  lifecycle: boolean;
}

export class DefaultIntegrationHealthMonitor
  implements IProviderIntegrationHealthMonitor
{
  private checks: Checks = {
    registry: true,
    manifest: true,
    compatibility: true,
    synchronization: true,
    lifecycle: true,
  };

  constructor(private readonly nowIso: () => string = () => new Date().toISOString()) {}

  recordRegistryCheck(ok: boolean): void {
    this.checks.registry = ok;
  }
  recordManifestCheck(ok: boolean): void {
    this.checks.manifest = ok;
  }
  recordCompatibilityCheck(ok: boolean): void {
    this.checks.compatibility = ok;
  }
  recordSynchronizationCheck(ok: boolean): void {
    this.checks.synchronization = ok;
  }
  recordLifecycleCheck(ok: boolean): void {
    this.checks.lifecycle = ok;
  }

  aggregate(): ProviderIntegrationHealth {
    const values = Object.values(this.checks);
    const failCount = values.filter((v) => !v).length;
    let state: ProviderIntegrationHealth["state"] = "healthy";
    if (failCount > 0 && failCount < values.length) {
      state = "degraded";
    } else if (failCount === values.length) {
      state = "unhealthy";
    } else if (values.every((v) => v === undefined)) {
      state = "unknown";
    }

    return {
      state,
      registryHealthy: this.checks.registry,
      manifestHealthy: this.checks.manifest,
      compatibilityHealthy: this.checks.compatibility,
      synchronizationHealthy: this.checks.synchronization,
      lifecycleHealthy: this.checks.lifecycle,
      checkedAt: this.nowIso(),
      details: { ...this.checks },
    };
  }
}
