/**
 * Lifecycle contracts.
 */

import type { TemplateLifecyclePhase } from "./enums";

export interface TemplateLifecycleEvent {
  readonly phase: TemplateLifecyclePhase;
  readonly timestamp: string;
  readonly message?: string;
}

export interface TemplateLifecycleState {
  readonly currentPhase: TemplateLifecyclePhase;
  readonly history: readonly TemplateLifecycleEvent[];
  readonly ready: boolean;
}
