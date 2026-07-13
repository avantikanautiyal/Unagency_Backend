/**
 * Provider activation state contract.
 *
 * Purpose: Track whether a provider is active, paused, or disabled.
 * Responsibilities: Activation lifecycle without execution.
 * Usage: Produced by IProviderActivator.
 * Future Extension: Scheduled activation windows.
 */

import type { ProviderId } from "../../../shared/identifiers";
import type { ProviderActivationState } from "./enums";

export interface ProviderActivationRecord {
  readonly providerId: ProviderId;
  readonly state: ProviderActivationState;
  readonly activatedAt?: string;
  readonly pausedAt?: string;
  readonly disabledAt?: string;
  readonly reason?: string;
}
