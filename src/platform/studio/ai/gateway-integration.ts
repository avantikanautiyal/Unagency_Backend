/**
 * Gateway integration helper — envelopes only.
 * Studio never calls OS / providers / runtime / business / persistence directly.
 */

import type { StudioGatewayRequest } from "../contracts";

export function isGatewayOnlyChannel(
  request: StudioGatewayRequest
): boolean {
  return request.channel === "enterprise_api_gateway";
}

export function assertNoDirectBackendPaths(path: string): boolean {
  const forbidden = [
    "/intelligence/",
    "/providers/",
    "/runtime/",
    "/routing/",
    "/persistence/",
  ];
  return !forbidden.some((p) => path.includes(p));
}
