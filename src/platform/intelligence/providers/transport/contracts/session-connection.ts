/**
 * Session, connection, and pool contracts.
 *
 * Purpose: Immutable transport session + connection/pool state.
 * Responsibilities: Describe lifecycle-bearing transport resources.
 * Usage: Produced by the engine, connection manager, and pool.
 * Future Extension: TLS metadata, multiplexed streams.
 */

import type { ProviderId } from "../../../shared/identifiers";
import type {
  ConnectionState,
  TransportProtocol,
  TransportSessionState,
} from "./enums";
import type {
  ConnectionId,
  PoolId,
  TransportSessionId,
} from "./identifiers";

export interface TransportSession {
  readonly sessionId: TransportSessionId;
  readonly requestId: string;
  readonly providerId: ProviderId;
  readonly protocol: TransportProtocol;
  readonly state: TransportSessionState;
  readonly connectionId?: ConnectionId;
  readonly openedAt: string;
  readonly closedAt?: string;
}

export interface TransportConnection {
  readonly connectionId: ConnectionId;
  readonly protocol: TransportProtocol;
  readonly state: ConnectionState;
  readonly poolId?: PoolId;
  readonly keepAlive: boolean;
  readonly useCount: number;
  readonly createdAt: string;
  readonly lastUsedAt: string;
}

export interface TransportPool {
  readonly poolId: PoolId;
  readonly protocol: TransportProtocol;
  readonly maxSize: number;
  readonly active: number;
  readonly idle: number;
  readonly connectionIds: readonly ConnectionId[];
}
