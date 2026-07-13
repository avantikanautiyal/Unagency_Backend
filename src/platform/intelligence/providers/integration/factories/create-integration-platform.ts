/**
 * Integration platform factory.
 *
 * Purpose: Wire the full integration platform with in-memory defaults.
 * Usage: `const { engine } = createIntegrationPlatform();`
 *
 * No networking, no SDK packages, no persistence, no execution.
 */

import { DefaultProviderActivator } from "../activation/default-activator";
import { DefaultCompatibilityEngine } from "../compatibility/default-compatibility-engine";
import { DefaultIntegrationDiagnostics } from "../diagnostics/default-diagnostics";
import { DefaultDiscoveryEngine } from "../discovery/default-discovery-engine";
import { ProviderIntegrationEngine } from "../engine/integration-engine";
import { DefaultIntegrationHealthMonitor } from "../health/default-health-monitor";
import { DefaultProviderInstaller } from "../installation/default-installer";
import { InMemoryLifecycleManager } from "../lifecycle/in-memory-lifecycle-manager";
import { InMemoryIntegrationRegistry } from "../registry/in-memory-integration-registry";
import { DefaultSynchronizationEngine } from "../synchronization/default-synchronization-engine";
import { DefaultVersionManager } from "../versioning/default-version-manager";
import type {
  IIntegrationEventPublisher,
  IProviderIntegrationDiagnostics,
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

export interface IntegrationPlatform {
  readonly engine: IProviderIntegrationEngine;
  readonly registry: IProviderIntegrationRegistry;
  readonly installer: IProviderInstaller;
  readonly activator: IProviderActivator;
  readonly discovery: IProviderDiscoveryEngine;
  readonly synchronization: IProviderSynchronizationEngine;
  readonly compatibility: IProviderCompatibilityEngine;
  readonly lifecycle: IProviderLifecycleManager;
  readonly versionManager: IProviderVersionManager;
  readonly healthMonitor: IProviderIntegrationHealthMonitor;
  readonly diagnostics: IProviderIntegrationDiagnostics;
}

export interface CreateIntegrationPlatformOptions {
  readonly eventPublisher?: IIntegrationEventPublisher;
  readonly expectedVendors?: readonly string[];
  readonly nowIso?: () => string;
  readonly createId?: (prefix: string) => string;
}

export function createIntegrationPlatform(
  options: CreateIntegrationPlatformOptions = {}
): IntegrationPlatform {
  const nowIso = options.nowIso ?? (() => new Date().toISOString());
  const createId =
    options.createId ?? ((p) => `${p}_${Math.random().toString(36).slice(2)}`);

  const registry = new InMemoryIntegrationRegistry(nowIso);
  const installer = new DefaultProviderInstaller(nowIso, createId);
  const activator = new DefaultProviderActivator(nowIso);
  const versionManager = new DefaultVersionManager(nowIso);
  const lifecycle = new InMemoryLifecycleManager(registry);
  const discovery = new DefaultDiscoveryEngine(registry, nowIso);
  const compatibility = new DefaultCompatibilityEngine(nowIso);
  const synchronization = new DefaultSynchronizationEngine(
    registry,
    versionManager,
    nowIso
  );
  const healthMonitor = new DefaultIntegrationHealthMonitor(nowIso);
  const diagnostics = new DefaultIntegrationDiagnostics(
    registry,
    versionManager,
    installer,
    options.expectedVendors ?? []
  );

  const engine = new ProviderIntegrationEngine({
    registry,
    installer,
    activator,
    discovery,
    synchronization,
    compatibility,
    lifecycle,
    versionManager,
    healthMonitor,
    eventPublisher: options.eventPublisher,
    nowIso,
    createId,
  });

  return {
    engine,
    registry,
    installer,
    activator,
    discovery,
    synchronization,
    compatibility,
    lifecycle,
    versionManager,
    healthMonitor,
    diagnostics,
  };
}
