/**
 * Capability lifecycle status.
 *
 * Purpose: Represent capability publication lifecycle for registry and planner.
 * Responsibilities: Enumerate allowed status values and transition rules.
 * Usage: Set on CapabilityDefinition.status; planner will refuse Disabled later.
 * Future Extension: Custom status workflows per tenant.
 */

export type CapabilityStatus =
  | "draft"
  | "experimental"
  | "published"
  | "deprecated"
  | "archived"
  | "disabled";

const TRANSITIONS: Readonly<Record<CapabilityStatus, readonly CapabilityStatus[]>> = {
  draft: ["experimental", "published", "archived", "disabled"],
  experimental: ["published", "deprecated", "archived", "disabled", "draft"],
  published: ["deprecated", "archived", "disabled"],
  deprecated: ["archived", "disabled", "published"],
  archived: ["disabled"],
  disabled: ["draft", "archived"],
};

/**
 * Whether a lifecycle transition is allowed.
 */
export function canTransitionCapabilityStatus(
  from: CapabilityStatus,
  to: CapabilityStatus
): boolean {
  if (from === to) {
    return true;
  }
  return TRANSITIONS[from].includes(to);
}
