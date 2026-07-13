/**
 * In-memory lifecycle manager.
 *
 * Purpose: Track and transition provider integration lifecycle states.
 * Responsibilities: State machine enforcement.
 * Usage: Injected into integration engine.
 * Future Extension: Policy-gated transitions.
 */

import { failure, success, type Result } from "../../../shared/result";
import { NotFoundError, ValidationError } from "../../../shared/errors";
import type { ProviderId } from "../../../shared/identifiers";
import type { IntegrationLifecycleState } from "../contracts/enums";
import { canTransitionLifecycle } from "../contracts/enums";
import type { IProviderLifecycleManager } from "../interfaces/subsystems";
import type { InMemoryIntegrationRegistry } from "../registry/in-memory-integration-registry";

export class InMemoryLifecycleManager implements IProviderLifecycleManager {
  constructor(private readonly registry: InMemoryIntegrationRegistry) {}

  getState(providerId: ProviderId): IntegrationLifecycleState | undefined {
    const record = this.registry.resolve(providerId);
    return record.ok ? record.value.lifecycleState : undefined;
  }

  transition(
    providerId: ProviderId,
    to: IntegrationLifecycleState
  ): Result<IntegrationLifecycleState> {
    const current = this.getState(providerId);
    if (!current) {
      return failure(
        new NotFoundError("provider not in lifecycle", { providerId })
      );
    }
    if (!canTransitionLifecycle(current, to)) {
      return failure(
        new ValidationError("invalid lifecycle transition", {
          from: current,
          to,
        })
      );
    }
    const updated = this.registry.updateLifecycle(providerId, to);
    if (!updated.ok) return updated;
    return success(to);
  }

  canTransition(
    providerId: ProviderId,
    to: IntegrationLifecycleState
  ): boolean {
    const current = this.getState(providerId);
    return current ? canTransitionLifecycle(current, to) : false;
  }
}
