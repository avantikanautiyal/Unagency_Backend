/**
 * Step 9 — Versioned strategy experiment model (data/configuration, not hard-coded).
 */

import type { BenchmarkStrategy } from "../../contracts/benchmark-case";

export type StrategyApplicability = {
  readonly outputKinds?: readonly string[];
  readonly services?: readonly string[];
  readonly subtypes?: readonly string[];
  readonly modalities?: readonly ("text" | "image" | "video" | "document" | "website" | "presentation")[];
  readonly excludeOutputKinds?: readonly string[];
};

/** Immutable strategy configuration — influences request construction only. */
export type ExperimentStrategyDefinition = BenchmarkStrategy & {
  readonly strategyName: string;
  readonly description: string;
  readonly configuration: Readonly<Record<string, unknown>>;
  readonly applicability: StrategyApplicability;
  readonly createdAt: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
};

export function toBenchmarkStrategy(
  strategy: ExperimentStrategyDefinition,
): BenchmarkStrategy {
  return Object.freeze({
    strategyId: strategy.strategyId,
    version: strategy.version,
    label: strategy.label ?? strategy.strategyName,
  });
}

export function isStrategyApplicable(
  strategy: ExperimentStrategyDefinition,
  input: {
    readonly service: string;
    readonly subtype: string;
    readonly outputKind: string;
  },
): { readonly applicable: boolean; readonly reason?: string } {
  const { applicability: a } = strategy;
  if (a.excludeOutputKinds?.includes(input.outputKind)) {
    return Object.freeze({ applicable: false, reason: `outputKind ${input.outputKind} excluded` });
  }
  if (a.outputKinds?.length && !a.outputKinds.includes(input.outputKind)) {
    return Object.freeze({ applicable: false, reason: `outputKind ${input.outputKind} not in strategy scope` });
  }
  if (a.services?.length && !a.services.includes(input.service)) {
    return Object.freeze({ applicable: false, reason: `service ${input.service} not in strategy scope` });
  }
  if (a.subtypes?.length && !a.subtypes.includes(input.subtype)) {
    return Object.freeze({ applicable: false, reason: `subtype ${input.subtype} not in strategy scope` });
  }
  return Object.freeze({ applicable: true });
}
