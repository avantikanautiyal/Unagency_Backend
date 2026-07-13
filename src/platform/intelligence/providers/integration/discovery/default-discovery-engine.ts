/**
 * Default discovery engine.
 *
 * Purpose: Discover providers from registry/manifests only. No networking.
 * Responsibilities: Project discovery results for one or all providers.
 * Usage: Injected into integration engine.
 * Future Extension: Filtered discovery by capability/region.
 */

import { failure, success, type Result } from "../../../shared/result";
import { NotFoundError } from "../../../shared/errors";
import type { ProviderId } from "../../../shared/identifiers";
import type { ProviderDiscoveryResult } from "../contracts/reports";
import type { IProviderDiscoveryEngine } from "../interfaces/subsystems";
import type { InMemoryIntegrationRegistry } from "../registry/in-memory-integration-registry";
import { projectDiscoveryResult } from "../manifests/manifest-projection";

export class DefaultDiscoveryEngine implements IProviderDiscoveryEngine {
  constructor(
    private readonly registry: InMemoryIntegrationRegistry,
    private readonly nowIso: () => string = () => new Date().toISOString()
  ) {}

  discover(providerId: ProviderId): Result<ProviderDiscoveryResult> {
    const record = this.registry.resolve(providerId);
    if (!record.ok) return record;
    return success(
      projectDiscoveryResult(
        record.value.manifest,
        record.value.lifecycleState,
        this.nowIso()
      )
    );
  }

  discoverAll(): Result<readonly ProviderDiscoveryResult[]> {
    return success(
      this.registry.list().map((r) =>
        projectDiscoveryResult(r.manifest, r.lifecycleState, this.nowIso())
      )
    );
  }
}
