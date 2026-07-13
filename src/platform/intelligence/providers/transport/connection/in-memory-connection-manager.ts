/**
 * In-memory connection manager.
 *
 * Purpose: Manage logical connection acquisition/release/reuse. No sockets.
 * Responsibilities: Reuse idle keep-alive connections; track usage.
 * Usage: Injected into the pipeline/engine.
 * Future Extension: TLS metadata, health-aware eviction.
 */

import { failure, success, type Result } from "../../../shared/result";
import { ProviderError } from "../../../shared/errors";
import type { ConnectionId } from "../contracts/identifiers";
import { asConnectionId } from "../contracts/identifiers";
import type { TransportConnection } from "../contracts/session-connection";
import type {
  AcquireConnectionInput,
  IConnectionManager,
} from "../interfaces/connection";

export class InMemoryConnectionManager implements IConnectionManager {
  private readonly connections = new Map<string, TransportConnection>();

  constructor(
    private readonly nowIso: () => string = () => new Date().toISOString(),
    private readonly createId: (prefix: string) => string = (p) =>
      `${p}_${Math.random().toString(36).slice(2)}`
  ) {}

  acquire(input: AcquireConnectionInput): Result<TransportConnection> {
    const keepAlive = input.keepAlive ?? true;
    const now = this.nowIso();

    const reusable = [...this.connections.values()].find(
      (c) =>
        c.protocol === input.protocol &&
        c.poolId === input.poolId &&
        c.state === "idle" &&
        c.keepAlive
    );

    if (reusable) {
      const updated: TransportConnection = {
        ...reusable,
        state: "in_use",
        useCount: reusable.useCount + 1,
        lastUsedAt: now,
      };
      this.connections.set(String(updated.connectionId), updated);
      return success(updated);
    }

    const connectionId = asConnectionId(this.createId("conn"));
    const connection: TransportConnection = {
      connectionId,
      protocol: input.protocol,
      state: "in_use",
      poolId: input.poolId,
      keepAlive,
      useCount: 1,
      createdAt: now,
      lastUsedAt: now,
    };
    this.connections.set(String(connectionId), connection);
    return success(connection);
  }

  release(connectionId: ConnectionId): Result<TransportConnection> {
    const current = this.connections.get(String(connectionId));
    if (!current) {
      return failure(
        new ProviderError("connection not found", { connectionId })
      );
    }
    const updated: TransportConnection = {
      ...current,
      state: current.keepAlive ? "idle" : "closed",
      lastUsedAt: this.nowIso(),
    };
    this.connections.set(String(connectionId), updated);
    return success(updated);
  }

  get(connectionId: ConnectionId): TransportConnection | undefined {
    return this.connections.get(String(connectionId));
  }

  list(): readonly TransportConnection[] {
    return [...this.connections.values()];
  }
}
