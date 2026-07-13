/**
 * Gateway middleware placeholders (no HTTP).
 */

import type { ILogger } from "../../shared/interfaces";
import type { GatewayCapabilityRequest } from "../contracts/gateway-request";

export interface IGatewayMiddleware {
  readonly name: string;
  beforeInvoke?(request: GatewayCapabilityRequest): Promise<void> | void;
  afterInvoke?(
    request: GatewayCapabilityRequest,
    success: boolean
  ): Promise<void> | void;
}

export class GatewayLoggingMiddleware implements IGatewayMiddleware {
  readonly name = "logging";

  constructor(private readonly logger?: ILogger) {}

  beforeInvoke(request: GatewayCapabilityRequest): void {
    this.logger?.info("gateway.invoke.before", {
      capabilityId: String(request.capabilityId),
      correlationId: request.correlationId,
    });
  }

  afterInvoke(request: GatewayCapabilityRequest, success: boolean): void {
    this.logger?.info("gateway.invoke.after", {
      capabilityId: String(request.capabilityId),
      success,
    });
  }
}
