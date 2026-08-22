/**
 * Production composition assertions — fail closed on test fakes in LIVE paths.
 */

import type { EnterpriseApiExecutionMode } from "../../api/runtime/execution-mode";
import type { IProviderDispatcher } from "../../intelligence/providers/runtime/interfaces/provider-dispatcher";
import { isFakeCapabilityRegistry } from "./create-production-negotiation";

export class ProductionCompositionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductionCompositionError";
  }
}

export function isControllableDispatcher(dispatcher: unknown): boolean {
  if (!dispatcher || typeof dispatcher !== "object") return false;
  const name = (dispatcher as { constructor?: { name?: string } }).constructor?.name;
  if (name === "ControllableDispatcher") return true;
  return (
    (dispatcher as { __unagencySimulatedDispatcher?: boolean })
      .__unagencySimulatedDispatcher === true
  );
}

export interface AssertProductionCompositionInput {
  readonly executionMode: EnterpriseApiExecutionMode;
  readonly runtimeDispatcher?: IProviderDispatcher;
  readonly capabilityRegistry?: unknown;
  readonly negotiationSource?: "production" | "testing" | "unknown";
  readonly allowSimulatedDispatcher?: boolean;
}

/**
 * LIVE must never use ControllableDispatcher or FakeCapabilityRegistry.
 * SIMULATED may use ControllableDispatcher only when explicitly allowed (default true for simulated).
 */
export function assertProductionComposition(
  input: AssertProductionCompositionInput
): void {
  if (input.negotiationSource === "testing") {
    throw new ProductionCompositionError(
      "Production OS composition must not use testing negotiation (FakeCapabilityRegistry)"
    );
  }

  if (input.capabilityRegistry && isFakeCapabilityRegistry(input.capabilityRegistry)) {
    throw new ProductionCompositionError(
      "FakeCapabilityRegistry is forbidden in production OS composition"
    );
  }

  if (input.executionMode === "live") {
    if (!input.runtimeDispatcher) {
      throw new ProductionCompositionError(
        "LIVE composition requires an explicit runtimeDispatcher (no silent ControllableDispatcher fallback)"
      );
    }
    if (isControllableDispatcher(input.runtimeDispatcher)) {
      throw new ProductionCompositionError(
        "LIVE composition forbids ControllableDispatcher — provide a real provider dispatcher"
      );
    }
  }

  if (
    input.executionMode === "simulated" &&
    input.allowSimulatedDispatcher === false &&
    input.runtimeDispatcher &&
    isControllableDispatcher(input.runtimeDispatcher)
  ) {
    throw new ProductionCompositionError(
      "ControllableDispatcher not allowed for this simulated composition (allowSimulatedDispatcher=false)"
    );
  }
}
