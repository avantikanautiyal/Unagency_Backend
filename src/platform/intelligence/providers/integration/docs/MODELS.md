# M4.7 Integration Platform — Models & Diagrams

## 1. Discovery Model

```
DefaultDiscoveryEngine
  discover(providerId)  → projectDiscoveryResult(manifest, lifecycleState)
  discoverAll()         → all registry records projected

ProviderDiscoveryResult fields:
  models, capabilities, modalities, features, versions, regions, limits
```

Discovery operates on **manifests and registry only** — no network calls.

## 2. Version Management Model

```
DefaultVersionManager
  track(providerId, installed, available?) → ProviderVersionManifest
  compare(installed, available)            → upgrade/downgrade/compatible
  deprecate(providerId)                    → compatibility: deprecated

ProviderVersionManifest:
  installedVersion, availableVersion, compatibility,
  upgradePath[], downgradePath[], deprecated
```

No package installation. Semantic version comparison only.

## 3. Lifecycle Model

```
registered → installed → activated ⇄ paused
                ↑           ↓
                └── deactivated
     activated/paused → disabled → removed
     activated → deprecated → removed
```

Enforced by `canTransitionLifecycle()` + `InMemoryLifecycleManager`.

## 4. Capability Synchronization Model

```
DefaultSynchronizationEngine.synchronize(providerId, manifest)
  1. projectFeatureInventory(manifest)
  2. projectModelInventory(manifest)
  3. registry.update(providerId, manifest)
  4. versionManager.track(providerId, manifest.version.raw)
  → ProviderSynchronizationReport
```

## 5. Registry Model

```
InMemoryIntegrationRegistry
  register(manifest, integrationId) → ProviderRegistrationRecord
  resolve(providerId)               → record
  list()                            → all records
  remove(providerId)                → void
  update(providerId, manifest)      → updated record
```

## 6. Health Model

```
DefaultIntegrationHealthMonitor aggregates:
  registryHealthy, manifestHealthy, compatibilityHealthy,
  synchronizationHealthy, lifecycleHealthy
  → state: healthy | degraded | unhealthy | unknown
```

## 7. Dependency Graph

```
contracts ← interfaces ← subsystems (registry, discovery, …)
                              ↑
                         engine + factory
```
