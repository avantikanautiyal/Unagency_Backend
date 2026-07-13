/**
 * Capability negotiator.
 *
 * Purpose: Validate a capability is usable for the requested provider.
 * Responsibilities: exists, enabled, maturity, constraints, policies, compatibility.
 * Usage: First stage of the negotiation pipeline.
 * Future Extension: Capability version-channel negotiation.
 */

import type { CapabilityStatus } from "../../../capability-registry/contracts/capability-status";
import type { ICapabilityRegistry } from "../../../capability-registry/interfaces/capability-registry";
import { success, type Result } from "../../../shared/result";
import type { CapabilityCompatibility } from "../contracts/compatibility";
import type { MaturityLevel } from "../contracts/enums";
import type { NegotiationProfile } from "../contracts/negotiation-result";
import type { NegotiationContext } from "../interfaces/context";
import type { ICapabilityNegotiator } from "../interfaces/negotiators";

function maturityOf(status: CapabilityStatus): MaturityLevel {
  switch (status) {
    case "draft":
      return "experimental";
    case "experimental":
      return "beta";
    case "published":
      return "stable";
    case "deprecated":
      return "deprecated";
    case "archived":
    case "disabled":
    default:
      return "unavailable";
  }
}

export class CapabilityNegotiator implements ICapabilityNegotiator {
  constructor(
    private readonly registry: ICapabilityRegistry,
    private readonly profile: NegotiationProfile
  ) {}

  negotiate(context: NegotiationContext): Result<CapabilityCompatibility> {
    const capabilityId = context.request.plan.capabilityId;
    const resolved = this.registry.resolve(capabilityId);

    if (!resolved.ok) {
      return success({
        capabilityId,
        exists: false,
        enabled: false,
        maturity: "unavailable",
        compatible: false,
        requiredPermissions: [],
        humanReviewRequired: false,
        reasons: ["capability not found in registry"],
      });
    }

    const capability = resolved.value;
    const reasons: string[] = [];
    const status = capability.status;
    const maturity = maturityOf(status);

    const isExperimental = status === "draft" || status === "experimental";
    const enabled =
      status !== "archived" &&
      status !== "disabled" &&
      (!isExperimental || this.profile.allowExperimentalCapabilities);

    if (status === "archived" || status === "disabled") {
      reasons.push(`capability status '${status}' is not usable`);
    } else if (isExperimental && !this.profile.allowExperimentalCapabilities) {
      reasons.push(`capability status '${status}' requires experimental opt-in`);
    }

    const compatibleIds = capability.providerCompatibility.compatibleProviderIds;
    const compatible =
      compatibleIds.length === 0 || compatibleIds.includes(context.providerId);
    if (!compatible) {
      reasons.push("provider is not compatible with this capability");
    }

    const humanReviewRequired =
      capability.humanReviewPolicy.required ||
      capability.constraints.humanReviewRequired?.required === true;

    return success({
      capabilityId,
      exists: true,
      enabled,
      maturity,
      compatible,
      requiredPermissions: capability.requiredPermissions,
      humanReviewRequired,
      reasons,
    });
  }
}
