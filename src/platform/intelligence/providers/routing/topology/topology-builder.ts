/**
 * Topology builder.
 */

import type { RoutingTopology } from "../contracts/plan";
import type { RoutingRequest } from "../contracts/request";

export function buildTopology(
  request: RoutingRequest,
  capturedAt: string
): RoutingTopology {
  return {
    capabilityId: request.capabilityId,
    nodes: request.candidates.map((c) => ({
      providerId: c.providerId,
      region: c.region,
      weight: c.priority ?? 1,
      healthy: c.healthy,
    })),
    capturedAt,
  };
}
