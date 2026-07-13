/**
 * Transport client ports.
 *
 * Purpose: Abstraction over every communication mechanism.
 * Responsibilities: send(), capability(), health() per protocol. No networking.
 * Usage: Resolved by the client registry; invoked by the dispatcher.
 * Future Extension: MCP + enterprise gateway clients.
 */

import type { Result } from "../../../shared/result";
import type { TransportCapability } from "../contracts/health-result";
import type { TransportHealth } from "../contracts/health-result";
import type { TransportProtocol } from "../contracts/enums";
import type {
  TransportRequest,
  TransportResponse,
} from "../contracts/transport-io";
import type { TransportContext } from "../contracts/context";

export interface ITransportClient {
  readonly protocol: TransportProtocol;
  capability(): TransportCapability;
  send(
    request: TransportRequest,
    context: TransportContext
  ): Promise<Result<TransportResponse>>;
  health(): Result<TransportHealth>;
}

/** Marker sub-interfaces — future milestones supply concrete implementations. */
export interface IHttpTransportClient extends ITransportClient {}
export interface ISdkTransportClient extends ITransportClient {}
export interface IGrpcTransportClient extends ITransportClient {}
export interface IWebSocketTransportClient extends ITransportClient {}
export interface ISseTransportClient extends ITransportClient {}
export interface ILocalTransportClient extends ITransportClient {}

export interface ITransportClientRegistry {
  register(client: ITransportClient): Result<void>;
  resolve(protocol: TransportProtocol): Result<ITransportClient>;
  has(protocol: TransportProtocol): boolean;
  list(): readonly TransportProtocol[];
}
