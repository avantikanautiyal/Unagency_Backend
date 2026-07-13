/**
 * Diagnostics port + report contracts.
 *
 * Purpose: Inspectable transport statistics + compatibility.
 * Responsibilities: connection/serialization/pool stats; protocol compat; latency.
 * Usage: Surfaced by the platform for observability.
 * Future Extension: Rolling percentile latency.
 */

import type { TransportProtocol } from "../contracts/enums";
import type { PoolId } from "../contracts/identifiers";
import type { TransportCapability } from "../contracts/health-result";

export interface ConnectionStatistics {
  readonly total: number;
  readonly active: number;
  readonly idle: number;
  readonly closed: number;
}

export interface SerializationStatistics {
  readonly serializations: number;
  readonly deserializations: number;
  readonly totalSerializedBytes: number;
  readonly totalDeserializedBytes: number;
}

export interface PoolStatistics {
  readonly poolId: PoolId;
  readonly maxSize: number;
  readonly active: number;
  readonly idle: number;
}

export interface ProtocolCompatibilityReport {
  readonly protocol: TransportProtocol;
  readonly capability: TransportCapability;
  readonly compatible: boolean;
  readonly reasons: readonly string[];
}

export interface LatencyMeasurement {
  readonly protocol: TransportProtocol;
  readonly samples: number;
  readonly averageMs?: number;
  readonly lastMs?: number;
}

export interface ProtocolRequirement {
  readonly streaming?: boolean;
  readonly bidirectional?: boolean;
  readonly keepAlive?: boolean;
}

export interface ITransportDiagnostics {
  connectionStatistics(): ConnectionStatistics;
  serializationStatistics(): SerializationStatistics;
  poolStatistics(poolId?: PoolId): readonly PoolStatistics[];
  protocolCompatibility(
    protocol: TransportProtocol,
    requirement: ProtocolRequirement
  ): ProtocolCompatibilityReport;
  latency(protocol: TransportProtocol): LatencyMeasurement;
  recordSerialization(bytes: number): void;
  recordDeserialization(bytes: number): void;
  recordLatency(protocol: TransportProtocol, latencyMs: number): void;
}
