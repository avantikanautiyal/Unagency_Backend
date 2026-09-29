/**
 * Structured circuit-breaker transition / evaluation diagnostics.
 * Safe for logs — no credentials, prompts, or sensitive bodies.
 */

import type { CircuitState } from "../contracts/circuit-breaker";
import type { PerformanceFailureCategory } from "../../routing/performance/contracts/performance-evidence";

export interface CircuitTransitionLogEvent {
  readonly event: "circuit_transition" | "circuit_evaluation";
  readonly scope: "provider.circuit";
  readonly provider: string;
  readonly model?: string;
  readonly capability?: string;
  readonly failureCategory?: PerformanceFailureCategory | string;
  readonly httpStatus?: number;
  readonly providerErrorCode?: string;
  readonly circuitStateBefore: CircuitState;
  readonly circuitStateAfter: CircuitState;
  readonly failureCount: number;
  readonly failureThreshold: number;
  readonly cooldownMs: number;
  readonly cooldownUntil?: string;
  readonly executionId?: string;
  readonly correlationId?: string;
  readonly requestId?: string;
  readonly timestamp: string;
  /** Why this evaluation happened (failure | success | probe | skip). */
  readonly reason?: string;
  /** Whether the circuit was tripped by this call (false for 429 / misconfig skips). */
  readonly circuitCounted?: boolean;
}

export type CircuitTransitionLogger = (event: CircuitTransitionLogEvent) => void;

let circuitTransitionLogger: CircuitTransitionLogger = (event) => {
  // eslint-disable-next-line no-console
  console.info(JSON.stringify(event));
};

export function setCircuitTransitionLogger(logger: CircuitTransitionLogger): void {
  circuitTransitionLogger = logger;
}

export function resetCircuitTransitionLogger(): void {
  circuitTransitionLogger = (event) => {
    // eslint-disable-next-line no-console
    console.info(JSON.stringify(event));
  };
}

export function logCircuitTransition(event: CircuitTransitionLogEvent): void {
  circuitTransitionLogger(event);
}

export interface CircuitOutcomeContext {
  readonly model?: string;
  readonly capability?: string;
  readonly failureCategory?: PerformanceFailureCategory | string;
  readonly httpStatus?: number;
  readonly providerErrorCode?: string;
  readonly executionId?: string;
  readonly correlationId?: string;
  readonly requestId?: string;
  readonly reason?: string;
  /** When false, failure was observed but did not increment/trip the breaker (e.g. 429). */
  readonly circuitCounted?: boolean;
}
