/**
 * Local transport client (functional, in-process).
 *
 * Purpose: A working, provider-independent transport for local runtime + tests.
 * Responsibilities: Deliver a TransportRequest to an injected in-process handler
 *   and return a TransportResponse. NO networking, NO sockets, NO SDK.
 * Usage: Registered for the "local" protocol; default handler echoes the body.
 * Future Extension: In-process worker/thread transports.
 */

import { success, type Result } from "../../../shared/result";
import type { TransportProtocol } from "../contracts/enums";
import type { TransportHealth, TransportCapability } from "../contracts/health-result";
import type { TransportContext } from "../contracts/context";
import type {
  TransportRequest,
  TransportResponse,
} from "../contracts/transport-io";
import type { ILocalTransportClient } from "../interfaces/clients";
import { capabilityForProtocol } from "../protocols/protocol-catalog";

export type LocalTransportHandler = (
  request: TransportRequest,
  context: TransportContext
) => Result<TransportResponse>;

export class LocalTransportClient implements ILocalTransportClient {
  readonly protocol: TransportProtocol = "local";

  constructor(
    private readonly handler: LocalTransportHandler = defaultEchoHandler,
    private readonly nowIso: () => string = () => new Date().toISOString()
  ) {}

  capability(): TransportCapability {
    return capabilityForProtocol("local");
  }

  async send(
    request: TransportRequest,
    context: TransportContext
  ): Promise<Result<TransportResponse>> {
    return this.handler(request, context);
  }

  health(): Result<TransportHealth> {
    return success({
      protocol: "local",
      state: "healthy",
      connectionHealthy: true,
      poolHealthy: true,
      checkedAt: this.nowIso(),
    });
  }
}

export const defaultEchoHandler: LocalTransportHandler = (request) =>
  success({
    sessionId: request.sessionId,
    requestId: request.requestId,
    protocol: request.protocol,
    body: request.body,
    headers: {},
    statusHint: 200,
    streamed: request.streaming,
    receivedAt: new Date().toISOString(),
  });
