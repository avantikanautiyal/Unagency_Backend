/**
 * Routing request contract.
 */

import type { CapabilityId, OrganizationId, ProviderId, WorkspaceId } from "../../../shared/identifiers";
import type { RoutingCandidate } from "./candidate";
import type { RoutingConstraint, RoutingPolicy } from "./policy";
import type { RoutingStrategyKind } from "./enums";

export interface RoutingPreferences {
  readonly preferredProviders?: readonly ProviderId[];
  readonly excludedProviders?: readonly ProviderId[];
  readonly region?: string;
  readonly tenantId?: OrganizationId;
  readonly workspaceId?: WorkspaceId;
  readonly stickyKey?: string;
}

export interface RoutingRequest {
  readonly requestId: string;
  readonly capabilityId: CapabilityId;
  readonly candidates: readonly RoutingCandidate[];
  readonly strategy: RoutingStrategyKind;
  readonly policy?: RoutingPolicy;
  readonly constraints?: readonly RoutingConstraint[];
  readonly preferences?: RoutingPreferences;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
}
