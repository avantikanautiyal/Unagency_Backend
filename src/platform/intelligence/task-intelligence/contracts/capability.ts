/**
 * Capability mapping contracts.
 */

import type { CapabilityId } from "../../shared/identifiers";

export interface CapabilityRequirement {
  readonly capabilityId: CapabilityId;
  readonly label: string;
  readonly priority: number;
  readonly confidence: number;
  readonly rationale: string;
}

export interface CapabilityMap {
  readonly primary: CapabilityId;
  readonly requirements: readonly CapabilityRequirement[];
  readonly confidence: number;
  readonly rationale: string;
}
