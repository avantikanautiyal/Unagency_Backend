/**
 * Integration platform enumerations.
 *
 * Purpose: Closed unions for lifecycle, installation, activation, health.
 * Responsibilities: Shared vocabulary across the integration framework.
 * Usage: Referenced by contracts and subsystems.
 * Future Extension: Additive lifecycle values only.
 */

export type IntegrationLifecycleState =
  | "registered"
  | "installed"
  | "activated"
  | "paused"
  | "disabled"
  | "deprecated"
  | "removed";

export type ProviderInstallationState =
  | "pending"
  | "installing"
  | "installed"
  | "failed"
  | "uninstalled";

export type ProviderActivationState =
  | "inactive"
  | "activating"
  | "active"
  | "pausing"
  | "paused"
  | "deactivating"
  | "disabled";

export type IntegrationHealthState =
  | "healthy"
  | "degraded"
  | "unhealthy"
  | "unknown";

export type IntegrationAction =
  | "register"
  | "install"
  | "activate"
  | "deactivate"
  | "pause"
  | "disable"
  | "deprecate"
  | "remove"
  | "synchronize"
  | "validate"
  | "discover";

export type VersionCompatibility =
  | "compatible"
  | "upgrade_required"
  | "downgrade_required"
  | "incompatible"
  | "deprecated";

const LIFECYCLE_TRANSITIONS: Readonly<
  Record<IntegrationLifecycleState, readonly IntegrationLifecycleState[]>
> = {
  registered: ["installed", "removed"],
  installed: ["activated", "disabled", "removed"],
  activated: ["installed", "paused", "disabled", "deprecated", "removed"],
  paused: ["activated", "disabled", "removed"],
  disabled: ["activated", "removed"],
  deprecated: ["removed"],
  removed: [],
};

export function canTransitionLifecycle(
  from: IntegrationLifecycleState,
  to: IntegrationLifecycleState
): boolean {
  if (from === to) return true;
  return LIFECYCLE_TRANSITIONS[from].includes(to);
}

export function isTerminalLifecycleState(
  state: IntegrationLifecycleState
): boolean {
  return LIFECYCLE_TRANSITIONS[state].length === 0;
}
