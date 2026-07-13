/**
 * In-memory connection pool.
 *
 * Purpose: Bounded reuse of connections for a protocol. No sockets.
 * Responsibilities: acquire/release within maxSize; report pool stats.
 * Usage: Injected where pooling is needed.
 * Future Extension: Distributed pool; fair queueing.
 */

import { failure, success, type Result } from "../../../shared/result";
import { ProviderError } from "../../../shared/errors";
import type { TransportProtocol } from "../contracts/enums";
import type { PoolId } from "../contracts/identifiers";
import type {
  TransportConnection,
  TransportPool,
} from "../contracts/session-connection";
import type {
  IConnectionManager,
  IConnectionPool,
} from "../interfaces/connection";

export class InMemoryConnectionPool implements IConnectionPool {
  private readonly acquired = new Set<string>();

  constructor(
    readonly poolId: PoolId,
    private readonly protocol: TransportProtocol,
    private readonly manager: IConnectionManager,
    private readonly maxSize = 10
  ) {}

  acquire(): Result<TransportConnection> {
    if (this.acquired.size >= this.maxSize) {
      return failure(
        new ProviderError("connection pool exhausted", {
          poolId: this.poolId,
          maxSize: this.maxSize,
        })
      );
    }
    const result = this.manager.acquire({
      protocol: this.protocol,
      poolId: this.poolId,
      keepAlive: true,
    });
    if (!result.ok) {
      return result;
    }
    this.acquired.add(String(result.value.connectionId));
    return result;
  }

  release(connection: TransportConnection): Result<void> {
    this.acquired.delete(String(connection.connectionId));
    const released = this.manager.release(connection.connectionId);
    if (!released.ok) {
      return released;
    }
    return success(undefined);
  }

  stats(): TransportPool {
    const all = this.manager
      .list()
      .filter((c) => c.poolId === this.poolId);
    const idle = all.filter((c) => c.state === "idle").length;
    return {
      poolId: this.poolId,
      protocol: this.protocol,
      maxSize: this.maxSize,
      active: this.acquired.size,
      idle,
      connectionIds: all.map((c) => c.connectionId),
    };
  }
}
