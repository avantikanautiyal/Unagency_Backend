/**
 * Default SDK diagnostics.
 *
 * Purpose: Registration, configuration, compatibility, dependency, version reports.
 * Responsibilities: Inspectable SDK platform metrics.
 * Usage: Surfaced by the platform.
 * Future Extension: SDK package detection.
 */

import type { SdkVendor } from "../contracts/enums";
import type { SdkVersion } from "../contracts/version";
import { capabilityForVendor, allSdkVendors } from "../common/capability-catalog";
import type {
  FeatureRequirement,
  ISdkDiagnostics,
  SdkCompatibilityReport,
  SdkConfigurationReport,
  SdkDependencyReport,
  SdkRegistrationReport,
  SdkVersionReport,
} from "../interfaces/diagnostics";
import type { ISdkRegistry } from "../interfaces/registry";

interface ExecutionSample {
  count: number;
  totalLatencyMs: number;
  failures: number;
}

export class DefaultSdkDiagnostics implements ISdkDiagnostics {
  private readonly executions = new Map<SdkVendor, ExecutionSample>();

  constructor(private readonly registry: ISdkRegistry) {}

  registrationReport(vendor?: SdkVendor): readonly SdkRegistrationReport[] {
    const vendors = vendor ? [vendor] : allSdkVendors();
    return vendors.map((v) => {
      const registered = this.registry.list().includes(v);
      const descriptor = registered ? this.registry.describe(v) : undefined;
      return {
        vendor: v,
        registered,
        clientId: descriptor?.ok ? String(descriptor.value.clientId) : undefined,
        version: descriptor?.ok ? descriptor.value.version : undefined,
      };
    });
  }

  configurationReport(vendor: SdkVendor): SdkConfigurationReport {
    const registered = this.registry.list().includes(vendor);
    const reasons: string[] = [];
    if (!registered) {
      reasons.push("SDK wrapper not registered");
    }
    return {
      vendor,
      configured: registered,
      authenticationPresent: false,
      reasons,
    };
  }

  compatibilityReport(
    vendor: SdkVendor,
    requirement: FeatureRequirement
  ): SdkCompatibilityReport {
    const capability = capabilityForVendor(vendor);
    const missing: string[] = [];
    if (requirement.streaming && !capability.streaming) {
      missing.push("streaming");
    }
    if (requirement.functionCalling && !capability.functionCalling) {
      missing.push("functionCalling");
    }
    if (requirement.vision && !capability.vision) {
      missing.push("vision");
    }
    if (requirement.embeddings && !capability.embeddings) {
      missing.push("embeddings");
    }
    return {
      vendor,
      capability,
      compatible: missing.length === 0,
      missingFeatures: missing,
    };
  }

  dependencyReport(vendor: SdkVendor): SdkDependencyReport {
    const registered = this.registry.list().includes(vendor);
    const reasons: string[] = [];
    if (!registered) {
      reasons.push("wrapper not registered");
    }
    reasons.push("sdk package not installed (placeholder milestone)");
    return {
      vendor,
      sdkPackageInstalled: false,
      transportAvailable: true,
      adapterCompatible: true,
      reasons,
    };
  }

  versionReport(vendor: SdkVendor): SdkVersionReport | undefined {
    const descriptor = this.registry.describe(vendor);
    if (!descriptor.ok) {
      return undefined;
    }
    return {
      vendor,
      wrapperVersion: descriptor.value.version,
      sdkPackageVersion: undefined,
    };
  }

  recordExecution(vendor: SdkVendor, latencyMs: number, ok: boolean): void {
    const current = this.executions.get(vendor) ?? {
      count: 0,
      totalLatencyMs: 0,
      failures: 0,
    };
    this.executions.set(vendor, {
      count: current.count + 1,
      totalLatencyMs: current.totalLatencyMs + latencyMs,
      failures: current.failures + (ok ? 0 : 1),
    });
  }
}
