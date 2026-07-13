/**
 * Platform metadata value types.
 *
 * Purpose: Expose immutable platform identity and status from the kernel.
 * Responsibilities: Version, status, and aggregate platform info contracts.
 * Usage: Returned by PlatformKernel.getVersion(), getStatus(), getInfo().
 * Future Extension: Build metadata, commit SHA, feature flags snapshot.
 */

import type { PlatformLifecyclePhase } from "../../shared/enums";
import type { HealthStatus } from "../../shared/enums";
import type { LifecyclePhase } from "../interfaces/lifecycle";

/**
 * Semantic platform version.
 */
export interface PlatformVersion {
  readonly version: string;
  readonly name: string;
}

/**
 * Runtime platform status.
 */
export interface PlatformStatus {
  readonly phase: PlatformLifecyclePhase;
  readonly lifecyclePhase: LifecyclePhase;
  readonly ready: boolean;
  readonly enabled: boolean;
  readonly health?: HealthStatus;
}

/**
 * Aggregate platform information.
 */
export interface PlatformInfo {
  readonly version: PlatformVersion;
  readonly status: PlatformStatus;
  readonly startedAt?: string;
  readonly moduleCount: number;
}

/**
 * Kernel metadata snapshot (compatible with prior PlatformMetadata shape).
 */
export interface PlatformMetadata {
  readonly name: string;
  readonly version: string;
  readonly phase: PlatformLifecyclePhase;
  readonly startedAt?: string;
}
