/**
 * Model lifecycle contracts.
 */

import type { ModelLifecycleState } from "./enums";

export interface DeprecationMetadata {
  readonly deprecatedAt?: string;
  readonly sunsetAt?: string;
  readonly replacementModelId?: string;
  readonly migrationGuide?: string;
}

export interface ModelLifecycle {
  readonly state: ModelLifecycleState;
  readonly effectiveFrom: string;
  readonly deprecation?: DeprecationMetadata;
}
