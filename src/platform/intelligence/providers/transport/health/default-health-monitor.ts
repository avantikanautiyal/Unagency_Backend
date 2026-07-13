/**
 * Default transport health monitor.
 *
 * Purpose: Track per-protocol health from recorded observations.
 * Responsibilities: record ok/fail + latency; derive protocol/connection/pool health.
 * Usage: Injected into the engine + diagnostics.
 * Future Extension: Sliding windows, circuit integration.
 */

import type { TransportProtocol } from "../contracts/enums";
import type { TransportHealth } from "../contracts/health-result";
import type { ITransportHealthMonitor } from "../interfaces/engines";

interface Observation {
  oks: number;
  fails: number;
  lastLatencyMs?: number;
}

export class DefaultTransportHealthMonitor implements ITransportHealthMonitor {
  private readonly observations = new Map<TransportProtocol, Observation>();

  constructor(private readonly nowIso: () => string = () => new Date().toISOString()) {}

  record(protocol: TransportProtocol, ok: boolean, latencyMs?: number): void {
    const current = this.observations.get(protocol) ?? { oks: 0, fails: 0 };
    this.observations.set(protocol, {
      oks: current.oks + (ok ? 1 : 0),
      fails: current.fails + (ok ? 0 : 1),
      lastLatencyMs: latencyMs ?? current.lastLatencyMs,
    });
  }

  protocolHealth(protocol: TransportProtocol): TransportHealth {
    const obs = this.observations.get(protocol);
    const total = obs ? obs.oks + obs.fails : 0;
    let state: TransportHealth["state"] = "unknown";
    if (total > 0 && obs) {
      const failRatio = obs.fails / total;
      state = failRatio < 0.2 ? "healthy" : failRatio < 0.5 ? "degraded" : "unhealthy";
    }
    return {
      protocol,
      state,
      connectionHealthy: state !== "unhealthy",
      poolHealthy: state !== "unhealthy",
      checkedAt: this.nowIso(),
      details: obs ? { oks: obs.oks, fails: obs.fails } : undefined,
    };
  }

  connectionHealthy(): boolean {
    return true;
  }

  poolHealthy(): boolean {
    return true;
  }
}
