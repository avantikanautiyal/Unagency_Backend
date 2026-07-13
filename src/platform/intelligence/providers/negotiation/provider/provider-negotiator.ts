/**
 * Provider negotiator.
 *
 * Purpose: Determine whether a provider MAY serve the request.
 * Responsibilities: supported, availability, maturity, health, compatibility,
 *   restrictions. Does NOT execute or authenticate providers.
 * Usage: Second stage of the negotiation pipeline.
 * Future Extension: Live health probes (still via IProviderHealthStore).
 */

import type { ICapabilityRegistry } from "../../../capability-registry/interfaces/capability-registry";
import { success, type Result } from "../../../shared/result";
import type { IProviderHealthStore } from "../../health/provider-health";
import type { ProviderStatus } from "../../metadata/provider-definition";
import type { IProviderRegistry } from "../../registry/provider-registry";
import type { ProviderCompatibility } from "../contracts/compatibility";
import type { MaturityLevel } from "../contracts/enums";
import type { NegotiationProfile } from "../contracts/negotiation-result";
import type { NegotiationContext } from "../interfaces/context";
import type { IProviderNegotiator } from "../interfaces/negotiators";

function maturityOf(status: ProviderStatus): MaturityLevel {
  switch (status) {
    case "draft":
      return "experimental";
    case "active":
      return "stable";
    case "degraded":
    case "maintenance":
      return "beta";
    case "deprecated":
      return "deprecated";
    case "disabled":
    case "offline":
    default:
      return "unavailable";
  }
}

const AVAILABLE_STATUSES: readonly ProviderStatus[] = [
  "active",
  "degraded",
  "maintenance",
];

export class ProviderNegotiator implements IProviderNegotiator {
  constructor(
    private readonly registry: IProviderRegistry,
    private readonly capabilityRegistry: ICapabilityRegistry,
    private readonly profile: NegotiationProfile,
    private readonly health?: IProviderHealthStore
  ) {}

  negotiate(context: NegotiationContext): Result<ProviderCompatibility> {
    const providerId = context.providerId;
    const resolved = this.registry.resolveProvider(providerId);
    const reasons: string[] = [];

    if (!resolved.ok) {
      return success({
        providerId,
        supported: false,
        available: false,
        maturity: "unavailable",
        healthy: false,
        compatible: false,
        restricted: false,
        reasons: ["provider not found in registry"],
      });
    }

    const provider = resolved.value;
    const maturity = maturityOf(provider.status);

    const available = AVAILABLE_STATUSES.includes(provider.status);
    if (!available) {
      reasons.push(`provider status '${provider.status}' is not available`);
    }
    if (provider.status === "degraded" && !this.profile.allowDegradedProviders) {
      reasons.push("degraded providers are not permitted by profile");
    }

    // Health (placeholder store).
    const healthReport = this.health?.get(providerId);
    const healthy =
      healthReport === undefined
        ? provider.status === "active"
        : healthReport.status === "healthy" ||
          healthReport.status === "degraded";
    if (this.profile.requireHealthyProvider && !healthy) {
      reasons.push("provider is not healthy");
    }

    // Compatibility: provider supports the capability AND capability lists it.
    const capabilityId = context.request.plan.capabilityId;
    const providerSupportsCapability =
      provider.supportedCapabilities.includes(capabilityId);
    const capResolved = this.capabilityRegistry.resolve(capabilityId);
    const capabilityListsProvider =
      !capResolved.ok ||
      capResolved.value.providerCompatibility.compatibleProviderIds.length === 0 ||
      capResolved.value.providerCompatibility.compatibleProviderIds.includes(
        providerId
      );
    const compatible = providerSupportsCapability && capabilityListsProvider;
    if (!providerSupportsCapability) {
      reasons.push("provider does not declare support for the capability");
    }

    // Restrictions: excluded by plan routing constraints or capability providers.
    const excluded =
      context.request.plan.routingConstraints.excludedProviderIds.includes(
        providerId
      );
    const allowed =
      capResolved.ok && capResolved.value.constraints.allowedProviders
        ? capResolved.value.constraints.allowedProviders.providerIds.includes(
            providerId
          )
        : true;
    const restricted = excluded || !allowed;
    if (excluded) {
      reasons.push("provider is excluded by routing constraints");
    }
    if (!allowed) {
      reasons.push("provider is not in the capability's allowed providers");
    }

    return success({
      providerId,
      supported: true,
      available,
      maturity,
      healthy,
      compatible,
      restricted,
      reasons,
    });
  }
}
