/**
 * Model region contracts.
 */

import type { AvailabilityState } from "./enums";

export interface ModelRegion {
  readonly regionId: string;
  readonly label: string;
  readonly availability: AvailabilityState;
}
