/**
 * Placeholder transport clients.
 *
 * Purpose: Represent not-yet-implemented protocols without networking/SDKs.
 * Responsibilities: send() returns NOT_IMPLEMENTED; capability from the catalog.
 * Usage: Registered so protocol selection resolves; replaced in future milestones.
 * Future Extension: HTTP/SDK/gRPC/WebSocket/SSE concrete clients (later).
 */

import { failure, success, type Result } from "../../../shared/result";
import { NotImplementedError } from "../../../shared/errors";
import type { TransportProtocol } from "../contracts/enums";
import type { TransportCapability, TransportHealth } from "../contracts/health-result";
import type { TransportContext } from "../contracts/context";
import type {
  TransportRequest,
  TransportResponse,
} from "../contracts/transport-io";
import type {
  IGrpcTransportClient,
  IHttpTransportClient,
  ISdkTransportClient,
  ISseTransportClient,
  ITransportClient,
  IWebSocketTransportClient,
} from "../interfaces/clients";
import { capabilityForProtocol } from "../protocols/protocol-catalog";

abstract class PlaceholderTransportClient implements ITransportClient {
  abstract readonly protocol: TransportProtocol;

  constructor(protected readonly nowIso: () => string = () => new Date().toISOString()) {}

  capability(): TransportCapability {
    return capabilityForProtocol(this.protocol);
  }

  async send(
    _request: TransportRequest,
    _context: TransportContext
  ): Promise<Result<TransportResponse>> {
    return failure(
      new NotImplementedError(
        `${this.protocol} transport client is reserved for a future milestone`,
        { protocol: this.protocol }
      )
    );
  }

  health(): Result<TransportHealth> {
    return success({
      protocol: this.protocol,
      state: "unknown",
      connectionHealthy: false,
      poolHealthy: false,
      checkedAt: this.nowIso(),
    });
  }
}

export class HttpTransportClientPlaceholder
  extends PlaceholderTransportClient
  implements IHttpTransportClient
{
  readonly protocol: TransportProtocol = "https";
}

export class SdkTransportClientPlaceholder
  extends PlaceholderTransportClient
  implements ISdkTransportClient
{
  readonly protocol: TransportProtocol = "sdk";
}

export class GrpcTransportClientPlaceholder
  extends PlaceholderTransportClient
  implements IGrpcTransportClient
{
  readonly protocol: TransportProtocol = "grpc";
}

export class WebSocketTransportClientPlaceholder
  extends PlaceholderTransportClient
  implements IWebSocketTransportClient
{
  readonly protocol: TransportProtocol = "websocket";
}

export class SseTransportClientPlaceholder
  extends PlaceholderTransportClient
  implements ISseTransportClient
{
  readonly protocol: TransportProtocol = "sse";
}
