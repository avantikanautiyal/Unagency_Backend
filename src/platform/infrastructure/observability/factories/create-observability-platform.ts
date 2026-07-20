/**
 * Observability platform factory.
 */

import { ObservabilityEngine } from "../engine/observability-engine";
import type { IObservabilityEngine } from "../interfaces/observability";

export interface ObservabilityPlatform {
  readonly engine: IObservabilityEngine;
}

export interface CreateObservabilityOptions {
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
  readonly createId?: (prefix: string) => string;
  readonly budgetLimit?: number;
}

export function createObservabilityPlatform(
  options: CreateObservabilityOptions = {}
): ObservabilityPlatform {
  const engine = new ObservabilityEngine(options);
  return { engine };
}
