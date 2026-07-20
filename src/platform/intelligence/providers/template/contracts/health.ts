/**
 * Template health contracts.
 */

import type { TemplateHealthState, TemplateLifecyclePhase } from "./enums";

export interface TemplateHealthReport {
  readonly state: TemplateHealthState;
  readonly lifecyclePhase: TemplateLifecyclePhase;
  readonly message: string;
  readonly checksPassed: number;
  readonly checksFailed: number;
  readonly lastCheckedAt: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface TemplateHealthCheck {
  readonly id: string;
  readonly name: string;
  readonly passed: boolean;
  readonly message?: string;
}
