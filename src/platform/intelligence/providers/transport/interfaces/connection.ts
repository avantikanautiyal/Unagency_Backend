/**
 * Connection + pool ports.
 *
 * Purpose: Manage logical connection acquisition/reuse/pooling. No sockets.
 * Responsibilities: acquire/release/reuse; pool statistics + keep-alive.
 * Usage: Injected into the pipeline/engine.
 * Future Extension: TLS metadata, distributed pools.
 */

import type { Result } from "../../../shared/result";
import type { TransportProtocol } from "../contracts/enums";
import type { ConnectionId, PoolId } from "../contracts/identifiers";
import type {
  TransportConnection,
  TransportPool,
} from "../contracts/session-connection";

export interface AcquireConnectionInput {
  readonly protocol: TransportProtocol;
  readonly poolId?: PoolId;
  readonly keepAlive?: boolean;
}

export interface IConnectionManager {
  acquire(input: AcquireConnectionInput): Result<TransportConnection>;
  release(connectionId: ConnectionId): Result<TransportConnection>;
  get(connectionId: ConnectionId): TransportConnection | undefined;
  list(): readonly TransportConnection[];
}

export interface IConnectionPool {
  readonly poolId: PoolId;
  acquire(): Result<TransportConnection>;
  release(connection: TransportConnection): Result<void>;
  stats(): TransportPool;
}
