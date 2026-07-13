/**
 * Regional negotiator.
 *
 * Purpose: Validate the requested region against provider + capability rules.
 * Responsibilities: provider region, org/workspace region, compliance region.
 * Usage: Regional stage of the negotiation pipeline.
 * Future Extension: Data residency proofs and multi-region routing.
 */

import type { ICapabilityRegistry } from "../../../capability-registry/interfaces/capability-registry";
import { success, type Result } from "../../../shared/result";
import type { IProviderRegistry } from "../../registry/provider-registry";
import type { RegionalEvaluation } from "../contracts/evaluations";
import type { NegotiationProfile } from "../contracts/negotiation-result";
import type { NegotiationContext } from "../interfaces/context";
import type { IRegionalNegotiator } from "../interfaces/negotiators";

export class RegionalNegotiator implements IRegionalNegotiator {
  constructor(
    private readonly providerRegistry: IProviderRegistry,
    private readonly capabilityRegistry: ICapabilityRegistry,
    private readonly profile: NegotiationProfile
  ) {}

  negotiate(context: NegotiationContext): Result<RegionalEvaluation> {
    const reasons: string[] = [];
    const region = context.request.region ?? this.profile.defaultRegion;

    const providerResult = this.providerRegistry.resolveProvider(
      context.providerId
    );
    const providerRegions = providerResult.ok
      ? providerResult.value.supportedRegions
      : [];

    // No region requested → nothing to validate.
    if (region === undefined) {
      return success({
        allowed: true,
        requestedRegion: undefined,
        providerRegions,
        reasons: ["no region requested"],
      });
    }

    let allowed = true;

    if (providerRegions.length > 0 && !providerRegions.includes(region)) {
      allowed = false;
      reasons.push(`provider does not serve region '${region}'`);
    }

    const capabilityResult = this.capabilityRegistry.resolve(
      context.request.plan.capabilityId
    );
    if (capabilityResult.ok) {
      const restriction =
        capabilityResult.value.constraints.regionRestrictions;
      if (restriction?.deniedRegions?.includes(region)) {
        allowed = false;
        reasons.push(`region '${region}' denied by capability compliance`);
      }
      if (
        restriction?.allowedRegions &&
        restriction.allowedRegions.length > 0 &&
        !restriction.allowedRegions.includes(region)
      ) {
        allowed = false;
        reasons.push(`region '${region}' not in capability allowed regions`);
      }
    }

    return success({
      allowed,
      requestedRegion: region,
      providerRegions,
      reasons,
    });
  }
}
