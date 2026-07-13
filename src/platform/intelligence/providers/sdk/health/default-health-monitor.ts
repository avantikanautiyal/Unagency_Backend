/**
 * Default SDK health monitor.
 *
 * Purpose: Track per-vendor health from observations and registration state.
 * Responsibilities: record ok/fail; derive vendor health.
 * Usage: Injected into the engine + diagnostics.
 * Future Extension: Sliding windows.
 */

import type { SdkVendor } from "../contracts/enums";
import type { SdkHealth } from "../contracts/health-result";
import type { ISdkHealthMonitor } from "../interfaces/engines";

interface Observation {
  oks: number;
  fails: number;
  lastLatencyMs?: number;
}

interface RegistrationState {
  registered: boolean;
  configured: boolean;
}

export class DefaultSdkHealthMonitor implements ISdkHealthMonitor {
  private readonly observations = new Map<SdkVendor, Observation>();
  private readonly registration = new Map<SdkVendor, RegistrationState>();

  constructor(private readonly nowIso: () => string = () => new Date().toISOString()) {}

  record(vendor: SdkVendor, ok: boolean, latencyMs?: number): void {
    const current = this.observations.get(vendor) ?? { oks: 0, fails: 0 };
    this.observations.set(vendor, {
      oks: current.oks + (ok ? 1 : 0),
      fails: current.fails + (ok ? 0 : 1),
      lastLatencyMs: latencyMs ?? current.lastLatencyMs,
    });
  }

  markRegistered(vendor: SdkVendor, registered: boolean): void {
    const state = this.registration.get(vendor) ?? {
      registered: false,
      configured: false,
    };
    this.registration.set(vendor, { ...state, registered });
  }

  markConfigured(vendor: SdkVendor, configured: boolean): void {
    const state = this.registration.get(vendor) ?? {
      registered: false,
      configured: false,
    };
    this.registration.set(vendor, { ...state, configured });
  }

  vendorHealth(vendor: SdkVendor): SdkHealth {
    const reg = this.registration.get(vendor);
    const obs = this.observations.get(vendor);
    const total = obs ? obs.oks + obs.fails : 0;

    let state: SdkHealth["state"] = "unknown";
    if (!reg?.registered) {
      state = "unconfigured";
    } else if (total > 0 && obs) {
      const failRatio = obs.fails / total;
      state =
        failRatio < 0.2 ? "healthy" : failRatio < 0.5 ? "degraded" : "unhealthy";
    } else if (reg.registered) {
      state = "healthy";
    }

    return {
      vendor,
      state,
      configured: reg?.configured ?? false,
      registered: reg?.registered ?? false,
      checkedAt: this.nowIso(),
      details: obs ? { oks: obs.oks, fails: obs.fails } : undefined,
    };
  }
}
