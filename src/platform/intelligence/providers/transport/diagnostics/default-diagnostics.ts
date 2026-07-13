/**
 * Default transport diagnostics.
 *
 * Purpose: Aggregate connection/serialization/pool stats + protocol compatibility.
 * Responsibilities: Expose inspectable transport metrics.
 * Usage: Injected into middleware (metrics) + surfaced by the platform.
 * Future Extension: Percentile latency, rolling windows.
 */

import type { TransportProtocol } from "../contracts/enums";
import type { PoolId } from "../contracts/identifiers";
import type { IConnectionManager, IConnectionPool } from "../interfaces/connection";
import type {
  ConnectionStatistics,
  ITransportDiagnostics,
  LatencyMeasurement,
  PoolStatistics,
  ProtocolCompatibilityReport,
  ProtocolRequirement,
  SerializationStatistics,
} from "../interfaces/diagnostics";
import { capabilityForProtocol } from "../protocols/protocol-catalog";

interface LatencyAccumulator {
  count: number;
  totalMs: number;
  lastMs?: number;
}

export interface TransportDiagnosticsDeps {
  readonly connectionManager: IConnectionManager;
  readonly pools?: readonly IConnectionPool[];
}

export class DefaultTransportDiagnostics implements ITransportDiagnostics {
  private serializations = 0;
  private deserializations = 0;
  private totalSerializedBytes = 0;
  private totalDeserializedBytes = 0;
  private readonly latencySamples = new Map<TransportProtocol, LatencyAccumulator>();

  constructor(private readonly deps: TransportDiagnosticsDeps) {}

  connectionStatistics(): ConnectionStatistics {
    const all = this.deps.connectionManager.list();
    return {
      total: all.length,
      active: all.filter((c) => c.state === "in_use" || c.state === "acquired").length,
      idle: all.filter((c) => c.state === "idle").length,
      closed: all.filter((c) => c.state === "closed").length,
    };
  }

  serializationStatistics(): SerializationStatistics {
    return {
      serializations: this.serializations,
      deserializations: this.deserializations,
      totalSerializedBytes: this.totalSerializedBytes,
      totalDeserializedBytes: this.totalDeserializedBytes,
    };
  }

  poolStatistics(poolId?: PoolId): readonly PoolStatistics[] {
    return (this.deps.pools ?? [])
      .map((pool) => pool.stats())
      .filter((stats) => (poolId ? stats.poolId === poolId : true))
      .map((stats) => ({
        poolId: stats.poolId,
        maxSize: stats.maxSize,
        active: stats.active,
        idle: stats.idle,
      }));
  }

  protocolCompatibility(
    protocol: TransportProtocol,
    requirement: ProtocolRequirement
  ): ProtocolCompatibilityReport {
    const capability = capabilityForProtocol(protocol);
    const reasons: string[] = [];
    if (requirement.streaming && !capability.streaming) {
      reasons.push("streaming not supported by protocol");
    }
    if (requirement.bidirectional && !capability.bidirectional) {
      reasons.push("bidirectional not supported by protocol");
    }
    if (requirement.keepAlive && !capability.keepAlive) {
      reasons.push("keep-alive not supported by protocol");
    }
    return {
      protocol,
      capability,
      compatible: reasons.length === 0,
      reasons,
    };
  }

  latency(protocol: TransportProtocol): LatencyMeasurement {
    const acc = this.latencySamples.get(protocol);
    return {
      protocol,
      samples: acc?.count ?? 0,
      averageMs: acc && acc.count > 0 ? acc.totalMs / acc.count : undefined,
      lastMs: acc?.lastMs,
    };
  }

  recordSerialization(bytes: number): void {
    this.serializations += 1;
    this.totalSerializedBytes += bytes;
  }

  recordDeserialization(bytes: number): void {
    this.deserializations += 1;
    this.totalDeserializedBytes += bytes;
  }

  recordLatency(protocol: TransportProtocol, latencyMs: number): void {
    const acc = this.latencySamples.get(protocol) ?? { count: 0, totalMs: 0 };
    this.latencySamples.set(protocol, {
      count: acc.count + 1,
      totalMs: acc.totalMs + latencyMs,
      lastMs: latencyMs,
    });
  }
}
