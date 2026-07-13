/**
 * Provider integration engine (platform facade).
 *
 * Purpose: Orchestrate register/install/activate/sync/discover without execution.
 * Responsibilities: Route actions to subsystems; produce ProviderIntegrationResult.
 * Usage: Public entry point for provider integration.
 * Future Extension: Batch integration, async jobs.
 *
 * NO networking. NO SDK packages. NO provider execution.
 */

import { failure, success, type Result } from "../../../shared/result";
import { ValidationError } from "../../../shared/errors";
import type { ProviderId } from "../../../shared/identifiers";
import type { IntegrationAction, IntegrationLifecycleState } from "../contracts/enums";
import { asIntegrationId } from "../contracts/identifiers";
import type { ProviderActivationRecord } from "../contracts/activation";
import type { ProviderInstallation } from "../contracts/installation";
import type {
  ProviderIntegrationHealth,
  ProviderIntegrationSnapshot,
  ProviderIntegrationStatistics,
} from "../contracts/health-registration";
import type {
  ProviderIntegrationRequest,
  ProviderIntegrationResult,
} from "../contracts/request-result";
import type {
  ProviderDiscoveryResult,
  ProviderSynchronizationReport,
} from "../contracts/reports";
import type { ProviderVersionManifest } from "../contracts/versioning";
import type {
  IIntegrationEventPublisher,
  IProviderIntegrationEngine,
  IProviderIntegrationHealthMonitor,
} from "../interfaces/engine";
import type { IProviderIntegrationRegistry } from "../interfaces/registry";
import type {
  IProviderActivator,
  IProviderCompatibilityEngine,
  IProviderDiscoveryEngine,
  IProviderInstaller,
  IProviderLifecycleManager,
  IProviderSynchronizationEngine,
  IProviderVersionManager,
} from "../interfaces/subsystems";
import type { ProviderManifest } from "../../adapters/contracts/provider-manifest";

export interface IntegrationEngineDeps {
  readonly registry: IProviderIntegrationRegistry;
  readonly installer: IProviderInstaller;
  readonly activator: IProviderActivator;
  readonly discovery: IProviderDiscoveryEngine;
  readonly synchronization: IProviderSynchronizationEngine;
  readonly compatibility: IProviderCompatibilityEngine;
  readonly lifecycle: IProviderLifecycleManager;
  readonly versionManager: IProviderVersionManager;
  readonly healthMonitor: IProviderIntegrationHealthMonitor;
  readonly eventPublisher?: IIntegrationEventPublisher;
  readonly nowIso?: () => string;
  readonly createId?: (prefix: string) => string;
}

interface ActionOutcome {
  readonly success: boolean;
  readonly lifecycleState: IntegrationLifecycleState;
  readonly installation?: ProviderInstallation;
  readonly activation?: ProviderActivationRecord;
  readonly discovery?: ProviderDiscoveryResult;
  readonly synchronization?: ProviderSynchronizationReport;
  readonly versionManifest?: ProviderVersionManifest;
}

export class ProviderIntegrationEngine implements IProviderIntegrationEngine {
  private readonly nowIso: () => string;
  private readonly createId: (prefix: string) => string;

  constructor(private readonly deps: IntegrationEngineDeps) {
    this.nowIso = deps.nowIso ?? (() => new Date().toISOString());
    this.createId = deps.createId ?? ((p) => `${p}_${Math.random().toString(36).slice(2)}`);
  }

  async integrate(
    request: ProviderIntegrationRequest
  ): Promise<Result<ProviderIntegrationResult>> {
    const integrationId = asIntegrationId(this.createId("integration"));
    const warnings: string[] = [];
    let successFlag = true;

    const compatibility = this.deps.compatibility.validate(
      request.manifest,
      this.existingManifest(request.providerId)
    );
    this.deps.healthMonitor.recordCompatibilityCheck(
      compatibility.ok && compatibility.value.compatible
    );
    if (!compatibility.ok) return compatibility;
    if (!compatibility.value.compatible) {
      successFlag = false;
      warnings.push(...compatibility.value.issues.map((i) => i.message));
      if (request.action !== "validate") {
        return failure(
          new ValidationError("manifest compatibility check failed", {
            issues: compatibility.value.issues,
          })
        );
      }
    }
    this.deps.healthMonitor.recordManifestCheck(compatibility.value.compatible);

    const actionResult = await this.dispatchAction(request, integrationId, warnings);
    if (!actionResult.ok) {
      this.deps.healthMonitor.recordRegistryCheck(false);
      return actionResult;
    }

    this.deps.healthMonitor.recordRegistryCheck(true);
    this.deps.healthMonitor.recordLifecycleCheck(true);
    if (actionResult.value.synchronization) {
      this.deps.healthMonitor.recordSynchronizationCheck(
        actionResult.value.synchronization.synchronized
      );
    }

    const result: ProviderIntegrationResult = {
      requestId: request.requestId,
      integrationId,
      providerId: request.providerId,
      action: request.action,
      success: actionResult.value.success && successFlag,
      lifecycleState: actionResult.value.lifecycleState,
      installation: actionResult.value.installation,
      activation: actionResult.value.activation,
      discovery: actionResult.value.discovery,
      compatibility: compatibility.value,
      synchronization: actionResult.value.synchronization,
      versionManifest: actionResult.value.versionManifest,
      health: this.deps.healthMonitor.aggregate(),
      statistics: this.statistics(),
      warnings,
      completedAt: this.nowIso(),
    };

    if (this.deps.eventPublisher) {
      await this.deps.eventPublisher.publishResult(result);
    }
    return success(result);
  }

  discover(providerId?: ProviderId): Result<readonly ProviderDiscoveryResult[]> {
    if (providerId) {
      const one = this.deps.discovery.discover(providerId);
      if (!one.ok) return one;
      return success([one.value]);
    }
    return this.deps.discovery.discoverAll();
  }

  statistics(): ProviderIntegrationStatistics {
    const records = this.deps.registry.list();
    const count = (state: IntegrationLifecycleState) =>
      records.filter((r) => r.lifecycleState === state).length;
    return {
      totalProviders: records.length,
      registered: count("registered"),
      installed: count("installed"),
      activated: count("activated"),
      paused: count("paused"),
      disabled: count("disabled"),
      deprecated: count("deprecated"),
      removed: count("removed"),
    };
  }

  health(): ProviderIntegrationHealth {
    return this.deps.healthMonitor.aggregate();
  }

  snapshot(providerId: ProviderId): Result<ProviderIntegrationSnapshot> {
    const record = this.deps.registry.resolve(providerId);
    if (!record.ok) return record;
    return success({
      integrationId: record.value.integrationId,
      providerId,
      lifecycleState: record.value.lifecycleState,
      health: this.health(),
      statistics: this.statistics(),
      capturedAt: this.nowIso(),
    });
  }

  private existingManifest(providerId: ProviderId): ProviderManifest | undefined {
    const record = this.deps.registry.resolve(providerId);
    return record.ok ? record.value.manifest : undefined;
  }

  private async dispatchAction(
    request: ProviderIntegrationRequest,
    integrationId: ReturnType<typeof asIntegrationId>,
    warnings: string[]
  ): Promise<Result<ActionOutcome>> {
    const { action, manifest, providerId } = request;

    switch (action as IntegrationAction) {
      case "register": {
        const reg = this.deps.registry.register(manifest, integrationId);
        if (!reg.ok) return reg;
        return success({ success: true, lifecycleState: "registered" });
      }
      case "install": {
        if (!this.deps.registry.has(providerId)) {
          const reg = this.deps.registry.register(manifest, integrationId);
          if (!reg.ok) return reg;
        }
        const installed = this.deps.installer.install(manifest);
        if (!installed.ok) return installed;
        const transitioned = this.deps.lifecycle.transition(providerId, "installed");
        if (!transitioned.ok) return transitioned;
        const version = this.deps.versionManager.track(
          providerId,
          manifest.version.raw,
          request.targetVersion
        );
        if (!version.ok) return version;
        return success({
          success: true,
          lifecycleState: "installed",
          installation: installed.value,
          versionManifest: version.value,
        });
      }
      case "activate": {
        const activated = this.deps.activator.activate(providerId);
        if (!activated.ok) return activated;
        const transitioned = this.deps.lifecycle.transition(providerId, "activated");
        if (!transitioned.ok) {
          warnings.push("activation recorded but lifecycle transition failed");
          return success({
            success: false,
            lifecycleState: this.deps.lifecycle.getState(providerId) ?? "installed",
            activation: activated.value,
          });
        }
        return success({
          success: true,
          lifecycleState: "activated",
          activation: activated.value,
        });
      }
      case "deactivate": {
        const deactivated = this.deps.activator.deactivate(providerId);
        if (!deactivated.ok) return deactivated;
        const transitioned = this.deps.lifecycle.transition(providerId, "installed");
        if (!transitioned.ok) return transitioned;
        return success({
          success: true,
          lifecycleState: "installed",
          activation: deactivated.value,
        });
      }
      case "pause": {
        const paused = this.deps.activator.pause(providerId);
        if (!paused.ok) return paused;
        const transitioned = this.deps.lifecycle.transition(providerId, "paused");
        if (!transitioned.ok) return transitioned;
        return success({
          success: true,
          lifecycleState: "paused",
          activation: paused.value,
        });
      }
      case "disable": {
        const disabled = this.deps.activator.disable(providerId);
        if (!disabled.ok) return disabled;
        const transitioned = this.deps.lifecycle.transition(providerId, "disabled");
        if (!transitioned.ok) return transitioned;
        return success({
          success: true,
          lifecycleState: "disabled",
          activation: disabled.value,
        });
      }
      case "deprecate": {
        const version = this.deps.versionManager.deprecate(providerId);
        if (!version.ok) return version;
        const transitioned = this.deps.lifecycle.transition(providerId, "deprecated");
        if (!transitioned.ok) return transitioned;
        return success({
          success: true,
          lifecycleState: "deprecated",
          versionManifest: version.value,
        });
      }
      case "remove": {
        this.deps.installer.uninstall(providerId);
        const removed = this.deps.registry.remove(providerId);
        if (!removed.ok) return removed;
        return success({ success: true, lifecycleState: "removed" });
      }
      case "synchronize": {
        const sync = this.deps.synchronization.synchronize(providerId, manifest);
        if (!sync.ok) return sync;
        return success({
          success: sync.value.synchronized,
          lifecycleState: this.deps.lifecycle.getState(providerId) ?? "registered",
          synchronization: sync.value,
          versionManifest: sync.value.versionManifest,
        });
      }
      case "validate":
        return success({
          success: true,
          lifecycleState: this.deps.lifecycle.getState(providerId) ?? "registered",
        });
      case "discover": {
        const discovered = this.deps.discovery.discover(providerId);
        if (!discovered.ok) return discovered;
        return success({
          success: true,
          lifecycleState: this.deps.lifecycle.getState(providerId) ?? "registered",
          discovery: discovered.value,
        });
      }
      default:
        return failure(new ValidationError(`unsupported action: ${action}`));
    }
  }
}
